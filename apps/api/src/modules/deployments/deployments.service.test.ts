import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeploymentsService } from "./deployments.service.js";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import {
  DeploymentStatus,
  DeploymentTrigger,
  AuditAction,
} from "@cloudpilot/database";
import { encryptSecret } from "@cloudpilot/shared";

describe("DeploymentsService", () => {
  let service: DeploymentsService;
  let mockPrisma: any;
  let mockConfig: any;
  let mockQueueService: any;

  const validKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    mockPrisma = {
      project: {
        findUnique: vi.fn(),
      },
      environment: {
        findFirst: vi.fn(),
      },
      environmentVariable: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      deployment: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      deploymentLog: {
        findMany: vi.fn(),
      },
      release: {
        findFirst: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === "ENCRYPTION_MASTER_KEY") return validKey;
        return undefined;
      }),
    };

    mockQueueService = {
      addJob: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true),
    };

    service = new DeploymentsService(mockPrisma, mockConfig, mockQueueService);
  });

  describe("Trigger Deployment", () => {
    it("should create QUEUED deployment, decrypt secrets, and enqueue BullMQ job", async () => {
      const encryptedSecret = encryptSecret("super_secret_db_pass", validKey);

      mockPrisma.project.findUnique.mockResolvedValue({
        id: "proj_1",
        name: "My App",
        slug: "my-app",
        repositoryUrl: "https://github.com/org/repo.git",
        defaultBranch: "main",
        port: 3000,
        memoryLimitMb: 512,
        cpuLimit: 0.5,
      });

      mockPrisma.environment.findFirst.mockResolvedValue({
        id: "env_1",
        name: "Production",
        slug: "production",
      });

      mockPrisma.environmentVariable.findMany.mockResolvedValue([
        {
          key: "DB_PASS",
          encryptedValue: encryptedSecret.encryptedValue,
          iv: encryptedSecret.iv,
          authTag: encryptedSecret.authTag,
        },
      ]);

      mockPrisma.deployment.create.mockResolvedValue({
        id: "dep_123",
        status: DeploymentStatus.QUEUED,
        trigger: DeploymentTrigger.MANUAL,
      });

      const res = await service.trigger(
        {
          projectId: "proj_1",
          environmentId: "env_1",
          commitSha: "a1b2c3d4e5f67890123456789012345678901234",
          commitMessage: "test commit",
        },
        "user_owner",
      );

      expect(res.id).toBe("dep_123");
      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: "dep_123",
          commitSha: "a1b2c3d4e5f67890123456789012345678901234",
          envVars: { DB_PASS: "super_secret_db_pass" },
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.DEPLOYMENT_TRIGGER,
          }),
        }),
      );
    });

    it("should throw NotFoundException if project or environment not found", async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.trigger({
          projectId: "non_existent",
          environmentId: "env_1",
          commitSha: "11223344556677889900aabbccddeeff11223344",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("Cancel Deployment", () => {
    it("should cancel active/queued deployment and notify queue", async () => {
      mockPrisma.deployment.findUnique.mockResolvedValue({
        id: "dep_123",
        status: DeploymentStatus.QUEUED,
        projectId: "proj_1",
      });

      mockPrisma.deployment.update.mockResolvedValue({
        id: "dep_123",
        status: DeploymentStatus.CANCELLED,
      });

      const res = await service.cancel("dep_123", "user_1");
      expect(res.status).toBe(DeploymentStatus.CANCELLED);
      expect(mockQueueService.cancelJob).toHaveBeenCalledWith("dep_123");
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: AuditAction.DEPLOYMENT_CANCEL,
          }),
        }),
      );
    });

    it("should reject cancelling an already completed/succeeded deployment", async () => {
      mockPrisma.deployment.findUnique.mockResolvedValue({
        id: "dep_123",
        status: DeploymentStatus.SUCCEEDED,
      });

      await expect(service.cancel("dep_123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("Rollback Deployment", () => {
    it("should find target release, create rollback deployment and enqueue rollback job", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: "proj_1",
        name: "My App",
        slug: "my-app",
        repositoryUrl: "https://github.com/org/repo.git",
        defaultBranch: "main",
        port: 3000,
        memoryLimitMb: 512,
        cpuLimit: 0.5,
      });

      mockPrisma.environment.findFirst.mockResolvedValue({
        id: "env_1",
        name: "Production",
        slug: "production",
      });

      mockPrisma.release.findFirst.mockResolvedValue({
        id: "rel_target",
        version: 1,
        imageTag: "cloudpilot/my-app:production-v1",
        deploymentId: "dep_v1",
        deployment: {
          commitSha: "1111111111111111111111111111111111111111",
          branch: "main",
        },
      });

      mockPrisma.deployment.create.mockResolvedValue({
        id: "dep_rollback_1",
        status: DeploymentStatus.QUEUED,
        trigger: DeploymentTrigger.ROLLBACK,
      });

      const res = await service.rollback(
        {
          projectId: "proj_1",
          environmentId: "env_1",
          targetReleaseId: "rel_target",
        },
        "user_admin",
      );

      expect(res.id).toBe("dep_rollback_1");
      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: "dep_rollback_1",
          isRollback: true,
          rollbackFromReleaseId: "rel_target",
          imageTag: "cloudpilot/my-app:production-v1",
        }),
      );
    });
  });

  describe("Logs", () => {
    it("should return sequential deployment logs", async () => {
      mockPrisma.deployment.findUnique.mockResolvedValue({ id: "dep_1" });
      mockPrisma.deploymentLog.findMany.mockResolvedValue([
        { id: "log_1", step: "CLONE", message: "Cloning repo..." },
        { id: "log_2", step: "BUILD", message: "Building image..." },
      ]);

      const logs = await service.getLogs("dep_1");
      expect(logs).toHaveLength(2);
      expect(logs[0]?.step).toBe("CLONE");
    });
  });
});
