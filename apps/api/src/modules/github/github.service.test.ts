import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";
import { GitHubService } from "./github.service.js";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { DeploymentTrigger } from "@cloudpilot/database";
import { encryptString } from "@cloudpilot/shared";

describe("GitHubService", () => {
  let service: GitHubService;
  let mockPrisma: any;
  let mockConfig: any;
  let mockDeploymentsService: any;

  const masterKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const webhookSecret = "test_webhook_secret_key_12345";

  beforeEach(() => {
    mockPrisma = {
      project: {
        findFirst: vi.fn(),
      },
      webhookDelivery: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      oAuthAccount: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === "GITHUB_CLIENT_ID") return "client_123";
        if (key === "GITHUB_CLIENT_SECRET") return "secret_456";
        if (key === "GITHUB_REDIRECT_URI")
          return "http://localhost:4000/api/v1/github/callback";
        if (key === "GITHUB_WEBHOOK_SECRET") return webhookSecret;
        if (key === "ENCRYPTION_MASTER_KEY") return masterKey;
        return undefined;
      }),
    };

    mockDeploymentsService = {
      trigger: vi.fn(),
    };

    service = new GitHubService(mockPrisma, mockConfig, mockDeploymentsService);
  });

  describe("OAuth State Management", () => {
    it("should generate authorization URL with secure state and store it", () => {
      const res = service.getAuthorizationUrl("user_1");

      expect(res.authorizationUrl).toContain(
        "https://github.com/login/oauth/authorize",
      );
      expect(res.authorizationUrl).toContain("client_id=client_123");
      expect(res.authorizationUrl).toContain("state=");
      expect(res.configured).toBe(true);

      // Verify state can be consumed once
      const verifiedUserId = service.verifyAndConsumeState(res.state, "user_1");
      expect(verifiedUserId).toBe("user_1");

      // Consuming again must throw BadRequestException (single-use)
      expect(() => service.verifyAndConsumeState(res.state, "user_1")).toThrow(
        BadRequestException,
      );
    });

    it("should reject state when expected userId does not match", () => {
      const res = service.getAuthorizationUrl("user_1");
      expect(() =>
        service.verifyAndConsumeState(res.state, "user_wrong"),
      ).toThrow(BadRequestException);
    });

    it("should reject completely invalid or unknown state", () => {
      expect(() =>
        service.verifyAndConsumeState("random_invalid_state"),
      ).toThrow(BadRequestException);
    });
  });

  describe("Webhook Signature Verification", () => {
    it("should accept valid HMAC-SHA256 signature", () => {
      const payload = JSON.stringify({ action: "test" });
      const hmac = createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");
      const signatureHeader = `sha256=${hmac}`;

      const isValid = service.verifyWebhookSignature(payload, signatureHeader);
      expect(isValid).toBe(true);
    });

    it("should reject invalid or tampered signature", () => {
      const payload = JSON.stringify({ action: "test" });
      const signatureHeader =
        "sha256=11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";

      const isValid = service.verifyWebhookSignature(payload, signatureHeader);
      expect(isValid).toBe(false);
    });

    it("should reject missing or malformed signature header", () => {
      const payload = JSON.stringify({ action: "test" });
      expect(service.verifyWebhookSignature(payload, "")).toBe(false);
      expect(
        service.verifyWebhookSignature(payload, "invalid_prefix_signature"),
      ).toBe(false);
    });
  });

  describe("Webhook Duplicate & Idempotency Handling", () => {
    it("should reject webhook with 401 when signature is invalid", async () => {
      const payload = { zen: "Design for failure" };
      const rawBody = JSON.stringify(payload);
      const headers = {
        "x-github-delivery": "del_123",
        "x-github-event": "ping",
        "x-hub-signature-256": "sha256=invalid",
      };

      await expect(
        service.handleWebhook(headers, rawBody, payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should detect duplicate delivery and skip processing", async () => {
      const payload = { zen: "Design for failure" };
      const rawBody = JSON.stringify(payload);
      const hmac = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const headers = {
        "x-github-delivery": "del_duplicate_1",
        "x-github-event": "ping",
        "x-hub-signature-256": `sha256=${hmac}`,
      };

      // Mock delivery already exists
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        id: "del_duplicate_1",
        status: "PROCESSED",
      });

      const res = await service.handleWebhook(headers, rawBody, payload);
      expect(res.duplicate).toBe(true);
      expect(res.message).toBe("Delivery already processed");
      expect(mockDeploymentsService.trigger).not.toHaveBeenCalled();
    });
  });

  describe("Push Event Auto-Deployment Handling", () => {
    const validProject = {
      id: "proj_1",
      name: "Portfolio Site",
      slug: "portfolio-site",
      repositoryId: "987654321",
      repositoryFullName: "octocat/portfolio",
      autoDeployEnabled: true,
      autoDeployBranch: "main",
      defaultBranch: "main",
      webhookSecret: null,
      environments: [
        { id: "env_prod", name: "Production", isProduction: true },
        { id: "env_stage", name: "Staging", isProduction: false },
      ],
    };

    it("should trigger auto-deployment when push matches autoDeployBranch", async () => {
      const payload = {
        ref: "refs/heads/main",
        repository: {
          id: 987654321,
          full_name: "octocat/portfolio",
        },
        head_commit: {
          id: "a1b2c3d4e5f67890123456789012345678901234",
          message: "feat: add landing page",
        },
      };
      const rawBody = JSON.stringify(payload);
      const hmac = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const headers = {
        "x-github-delivery": "del_push_1",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${hmac}`,
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);
      mockPrisma.project.findFirst.mockResolvedValue(validProject);
      mockDeploymentsService.trigger.mockResolvedValue({
        id: "deploy_123",
        status: "QUEUED",
      });

      const res = await service.handleWebhook(headers, rawBody, payload);

      expect(res.processed).toBe(true);
      expect(res.deploymentId).toBe("deploy_123");
      expect(mockDeploymentsService.trigger).toHaveBeenCalledWith({
        projectId: "proj_1",
        environmentId: "env_prod",
        commitSha: "a1b2c3d4e5f67890123456789012345678901234",
        commitMessage: "feat: add landing page",
        branch: "main",
        trigger: DeploymentTrigger.GITHUB_WEBHOOK,
      });
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "del_push_1" },
          data: { status: "PROCESSED" },
        }),
      );
    });

    it("should ignore push when branch does not match autoDeployBranch", async () => {
      const payload = {
        ref: "refs/heads/feature-wip",
        repository: {
          id: 987654321,
          full_name: "octocat/portfolio",
        },
        head_commit: {
          id: "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2",
          message: "wip: experiments",
        },
      };
      const rawBody = JSON.stringify(payload);
      const hmac = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const headers = {
        "x-github-delivery": "del_push_wrong_branch",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${hmac}`,
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);
      mockPrisma.project.findFirst.mockResolvedValue(validProject);

      const res = await service.handleWebhook(headers, rawBody, payload);

      expect(res.processed).toBe(false);
      expect(res.reason).toContain(
        "does not match monitored auto-deploy branch",
      );
      expect(mockDeploymentsService.trigger).not.toHaveBeenCalled();
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "del_push_wrong_branch" },
          data: { status: "IGNORED" },
        }),
      );
    });

    it("should ignore push when autoDeployEnabled is false", async () => {
      const payload = {
        ref: "refs/heads/main",
        repository: {
          id: 987654321,
          full_name: "octocat/portfolio",
        },
        head_commit: {
          id: "d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3",
          message: "update",
        },
      };
      const rawBody = JSON.stringify(payload);
      const hmac = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const headers = {
        "x-github-delivery": "del_push_disabled",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${hmac}`,
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);
      mockPrisma.project.findFirst.mockResolvedValue({
        ...validProject,
        autoDeployEnabled: false,
      });

      const res = await service.handleWebhook(headers, rawBody, payload);

      expect(res.processed).toBe(false);
      expect(res.reason).toContain("Auto-deployment is disabled");
      expect(mockDeploymentsService.trigger).not.toHaveBeenCalled();
    });
  });

  describe("Token Retrieval & Decryption", () => {
    it("should safely decrypt stored token and fetch repositories", async () => {
      const rawToken = "ghp_real_looking_token_12345";
      const encryptedToken = encryptString(rawToken, masterKey);

      mockPrisma.oAuthAccount.findFirst.mockResolvedValue({
        userId: "user_1",
        accessTokenEncrypted: encryptedToken,
      });

      // Mock global fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 111,
            name: "repo-1",
            full_name: "octocat/repo-1",
            owner: { login: "octocat" },
            private: false,
            html_url: "https://github.com/octocat/repo-1",
            default_branch: "main",
            description: "Test repository",
            updated_at: "2026-10-10T12:00:00Z",
          },
        ],
      });
      global.fetch = mockFetch as any;

      const repos = await service.getRepositories("user_1");

      expect(repos).toHaveLength(1);
      expect(repos[0]?.fullName).toBe("octocat/repo-1");
      expect(repos[0]?.defaultBranch).toBe("main");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://api.github.com/user/repos"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${rawToken}`,
          }),
        }),
      );
    });

    it("should throw UnauthorizedException when token was revoked (401)", async () => {
      const rawToken = "ghp_revoked_token";
      const encryptedToken = encryptString(rawToken, masterKey);

      mockPrisma.oAuthAccount.findFirst.mockResolvedValue({
        userId: "user_1",
        accessTokenEncrypted: encryptedToken,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }) as any;

      await expect(service.getRepositories("user_1")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
