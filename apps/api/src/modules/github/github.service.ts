import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  OAuthProvider,
  AuditAction,
  DeploymentTrigger,
} from "@cloudpilot/database";
import { encryptString, decryptString } from "@cloudpilot/shared";
import { DeploymentsService } from "../deployments/deployments.service.js";
import {
  GitHubRepoSummary,
  GitHubBranchSummary,
  GitHubCommitSummary,
  GitHubConnectionStatus,
} from "./github.types.js";

interface OAuthStateItem {
  userId: string;
  expiresAt: number;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly stateStore = new Map<string, OAuthStateItem>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly deploymentsService: DeploymentsService,
  ) {
    // Periodic cleanup of expired OAuth states (every 5 minutes)
    setInterval(
      () => {
        const now = Date.now();
        for (const [key, val] of this.stateStore.entries()) {
          if (val.expiresAt < now) {
            this.stateStore.delete(key);
          }
        }
      },
      5 * 60 * 1000,
    ).unref();
  }

  private get clientId(): string | undefined {
    return this.config.get<string>("GITHUB_CLIENT_ID");
  }

  private get clientSecret(): string | undefined {
    return this.config.get<string>("GITHUB_CLIENT_SECRET");
  }

  private get redirectUri(): string {
    return (
      this.config.get<string>("GITHUB_REDIRECT_URI") ||
      "http://localhost:4000/api/v1/github/callback"
    );
  }

  private get defaultWebhookSecret(): string {
    return (
      this.config.get<string>("GITHUB_WEBHOOK_SECRET") ||
      "cloudpilot_dev_webhook_secret_key_12345"
    );
  }

  private get encryptionKey(): string {
    return this.config.get<string>("ENCRYPTION_MASTER_KEY")!;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Generates authorization URL for GitHub OAuth with cryptographically secure state
   */
  getAuthorizationUrl(userId: string): {
    authorizationUrl: string;
    state: string;
    configured: boolean;
  } {
    const configured = this.isConfigured();
    const state = randomBytes(32).toString("hex");

    // Store state with 10-minute validity
    this.stateStore.set(state, {
      userId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: this.clientId || "mock_github_client_id",
      redirect_uri: this.redirectUri,
      scope: "read:user,repo",
      state,
    });

    const authorizationUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

    return {
      authorizationUrl,
      state,
      configured,
    };
  }

  /**
   * Verifies and consumes the OAuth state token
   */
  verifyAndConsumeState(state: string, expectedUserId?: string): string {
    const entry = this.stateStore.get(state);
    if (!entry) {
      throw new BadRequestException("Invalid or unknown OAuth state");
    }

    this.stateStore.delete(state);

    if (entry.expiresAt < Date.now()) {
      throw new BadRequestException(
        "OAuth state has expired. Please try connecting again.",
      );
    }

    if (expectedUserId && entry.userId !== expectedUserId) {
      throw new BadRequestException("OAuth state user mismatch");
    }

    return entry.userId;
  }

  /**
   * Exchanges OAuth authorization code for an encrypted access token and persists to database
   */
  async handleOAuthCallback(
    code: string,
    state: string,
    currentUserId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        "GitHub integration is not configured on this server. GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required in .env",
      );
    }

    const userId = this.verifyAndConsumeState(state, currentUserId);

    // 1. Exchange code for token
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new BadRequestException(
        `Failed to exchange GitHub authorization code: HTTP ${tokenResponse.status}`,
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      throw new BadRequestException(
        `GitHub OAuth Error: ${tokenData.error_description || tokenData.error || "No access token received"}`,
      );
    }

    // 2. Fetch GitHub user profile
    const userProfileResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "CloudPilot-App",
        Accept: "application/vnd.github+json",
      },
    });

    if (!userProfileResponse.ok) {
      throw new BadRequestException("Failed to fetch GitHub user profile");
    }

    const githubUser = (await userProfileResponse.json()) as {
      id: number;
      login: string;
      avatar_url?: string;
    };

    // 3. Encrypt access token using AES-256-GCM before saving
    const encryptedToken = encryptString(
      tokenData.access_token,
      this.encryptionKey,
    );

    // 4. Upsert into database
    await this.prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GITHUB,
          providerAccountId: String(githubUser.id),
        },
      },
      create: {
        userId,
        provider: OAuthProvider.GITHUB,
        providerAccountId: String(githubUser.id),
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        scope: tokenData.scope,
        accessTokenEncrypted: encryptedToken,
      },
      update: {
        userId,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        scope: tokenData.scope,
        accessTokenEncrypted: encryptedToken,
      },
    });

    // 5. Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.OAUTH_CONNECT,
        metadata: {
          provider: "GITHUB",
          githubUsername: githubUser.login,
          githubId: githubUser.id,
        },
        ipAddress,
        userAgent,
      },
    });

    this.logger.log(
      `GitHub account '${githubUser.login}' connected for user '${userId}'`,
    );

    return {
      connected: true,
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      scope: tokenData.scope,
    };
  }

  /**
   * Retrieves connection status for the given user
   */
  async getConnectionStatus(userId: string): Promise<GitHubConnectionStatus> {
    const account = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: OAuthProvider.GITHUB,
      },
    });

    return {
      connected: Boolean(account),
      configured: this.isConfigured(),
      username: account?.username || undefined,
      avatarUrl: account?.avatarUrl || undefined,
      scope: account?.scope || undefined,
    };
  }

  /**
   * Disconnects GitHub account for user
   */
  async disconnect(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: OAuthProvider.GITHUB,
      },
    });

    if (!existing) {
      return { success: true };
    }

    await this.prisma.oAuthAccount.delete({
      where: { id: existing.id },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.OAUTH_DISCONNECT,
        metadata: {
          provider: "GITHUB",
          username: existing.username,
        },
        ipAddress,
        userAgent,
      },
    });

    this.logger.log(`GitHub disconnected for user '${userId}'`);
    return { success: true };
  }

  /**
   * Retrieves and decrypts GitHub access token for user
   */
  private async getDecryptedToken(userId: string): Promise<string> {
    const account = await this.prisma.oAuthAccount.findFirst({
      where: {
        userId,
        provider: OAuthProvider.GITHUB,
      },
    });

    if (!account || !account.accessTokenEncrypted) {
      throw new UnauthorizedException(
        "GitHub account not connected. Please connect your GitHub account first.",
      );
    }

    try {
      return decryptString(account.accessTokenEncrypted, this.encryptionKey);
    } catch {
      this.logger.error(`Failed to decrypt GitHub token for user ${userId}`);
      throw new UnauthorizedException(
        "Corrupted GitHub authentication token. Please reconnect your account.",
      );
    }
  }

  /**
   * Fetches repositories accessible to the connected user
   */
  async getRepositories(userId: string): Promise<GitHubRepoSummary[]> {
    const token = await this.getDecryptedToken(userId);

    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "CloudPilot-App",
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (response.status === 401) {
      throw new UnauthorizedException(
        "GitHub access token has expired or was revoked. Please reconnect your GitHub account.",
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Failed to fetch repositories from GitHub: HTTP ${response.status}`,
      );
    }

    const repos = (await response.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
      html_url: string;
      default_branch: string;
      description: string | null;
      updated_at: string;
    }>;

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      private: r.private,
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch || "main",
      description: r.description,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Fetches branches for a repository
   */
  async getBranches(
    userId: string,
    owner: string,
    repo: string,
  ): Promise<GitHubBranchSummary[]> {
    this.validateRepoName(owner, repo);
    const token = await this.getDecryptedToken(userId);

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "CloudPilot-App",
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException(
          `Repository '${owner}/${repo}' not found or you lack permission`,
        );
      }
      throw new BadRequestException(
        `Failed to fetch branches from GitHub: HTTP ${response.status}`,
      );
    }

    const branches = (await response.json()) as Array<{
      name: string;
      commit: { sha: string };
      protected: boolean;
    }>;

    return branches.map((b) => ({
      name: b.name,
      commitSha: b.commit.sha,
      protected: b.protected,
    }));
  }

  /**
   * Fetches latest commits for a repository and branch
   */
  async getCommits(
    userId: string,
    owner: string,
    repo: string,
    branch?: string,
  ): Promise<GitHubCommitSummary[]> {
    this.validateRepoName(owner, repo);
    const token = await this.getDecryptedToken(userId);

    const params = new URLSearchParams({ per_page: "20" });
    if (branch) params.set("sha", branch);

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "CloudPilot-App",
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException(
          `Repository or branch '${owner}/${repo}@${branch || "default"}' not found`,
        );
      }
      throw new BadRequestException(
        `Failed to fetch commits from GitHub: HTTP ${response.status}`,
      );
    }

    const commits = (await response.json()) as Array<{
      sha: string;
      commit: {
        message: string;
        author: { name: string; date: string };
      };
      html_url: string;
    }>;

    return commits.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.substring(0, 7),
      message: c.commit.message.split("\n")[0] || "No commit message",
      author: c.commit.author?.name || "Unknown",
      date: c.commit.author?.date || new Date().toISOString(),
      url: c.html_url,
    }));
  }

  /**
   * Validates owner and repository names to prevent path injection
   */
  private validateRepoName(owner: string, repo: string) {
    const validPattern = /^[a-zA-Z0-9_.-]+$/;
    if (!validPattern.test(owner) || !validPattern.test(repo)) {
      throw new BadRequestException("Invalid repository owner or name format");
    }
  }

  /**
   * Verifies GitHub webhook HMAC-SHA256 signature securely against timing attacks
   */
  verifyWebhookSignature(
    rawBody: Buffer | string,
    signatureHeader?: string,
    customSecret?: string,
  ): boolean {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }

    const secret = customSecret || this.defaultWebhookSecret;
    if (!secret) return false;

    const payloadBuffer =
      typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;

    const hmac = createHmac("sha256", secret);
    hmac.update(payloadBuffer);
    const expectedSignature = `sha256=${hmac.digest("hex")}`;

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(signatureHeader, "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  /**
   * Processes GitHub Webhook event with idempotency, signature validation, and auto-deployment
   */
  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
    payload: any,
  ) {
    const getHeader = (name: string): string | undefined => {
      const val = headers[name.toLowerCase()] || headers[name];
      return Array.isArray(val) ? val[0] : val;
    };

    const deliveryId = getHeader("x-github-delivery");
    const event = getHeader("x-github-event");
    const signature = getHeader("x-hub-signature-256");

    if (!deliveryId || !event) {
      throw new BadRequestException(
        "Missing required GitHub webhook headers (X-GitHub-Delivery, X-GitHub-Event)",
      );
    }

    // 1. Signature Verification
    // Check if the payload specifies a repository to check if that project has a custom webhookSecret
    const repoId = payload?.repository?.id
      ? String(payload.repository.id)
      : null;
    const repoFullName = payload?.repository?.full_name as string | undefined;

    let projectSecret: string | undefined;
    let matchingProject = null;

    if (repoId || repoFullName) {
      matchingProject = await this.prisma.project.findFirst({
        where: {
          OR: [
            ...(repoId ? [{ repositoryId: repoId }] : []),
            ...(repoFullName ? [{ repositoryFullName: repoFullName }] : []),
          ],
        },
        include: {
          environments: true,
        },
      });
      projectSecret = matchingProject?.webhookSecret || undefined;
    }

    const isSignatureValid =
      this.verifyWebhookSignature(rawBody, signature, projectSecret) ||
      this.verifyWebhookSignature(
        rawBody,
        signature,
        this.defaultWebhookSecret,
      );

    if (!isSignatureValid) {
      this.logger.warn(
        `Webhook signature verification failed for delivery: ${deliveryId}`,
      );
      throw new UnauthorizedException(
        "Invalid webhook signature. HMAC-SHA256 verification failed.",
      );
    }

    // 2. Idempotency Check: Prevent duplicate processing of the same delivery
    const existingDelivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (existingDelivery) {
      this.logger.log(
        `Duplicate webhook delivery received: ${deliveryId}. Skipping.`,
      );
      return {
        duplicate: true,
        message: "Delivery already processed",
        deliveryId,
      };
    }

    // Record incoming delivery
    await this.prisma.webhookDelivery.create({
      data: {
        id: deliveryId,
        event,
        repositoryId: repoId,
        status: "PROCESSING",
        payload: typeof payload === "object" ? payload : null,
      },
    });

    // 3. Handle specific events
    if (event === "ping") {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "PROCESSED" },
      });
      return {
        event: "ping",
        zen: payload.zen,
        hookId: payload.hook_id,
        message: "Ping acknowledged successfully",
      };
    }

    if (event === "push") {
      const ref = payload.ref as string; // e.g. "refs/heads/main"
      const headCommit = payload.head_commit;
      const commitSha = headCommit?.id || payload.after;
      const commitMessage =
        headCommit?.message || "Auto-deploy via GitHub push";

      if (!matchingProject) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: "IGNORED" },
        });
        return {
          processed: false,
          reason: "No project matches this repository",
        };
      }

      if (!matchingProject.autoDeployEnabled) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: "IGNORED" },
        });
        return {
          processed: false,
          reason: "Auto-deployment is disabled for this project",
        };
      }

      // Check branch matches configured autoDeployBranch
      const targetBranch =
        matchingProject.autoDeployBranch ||
        matchingProject.defaultBranch ||
        "main";
      const expectedRef = `refs/heads/${targetBranch}`;

      if (ref !== expectedRef) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: "IGNORED" },
        });
        return {
          processed: false,
          reason: `Push ref '${ref}' does not match monitored auto-deploy branch '${targetBranch}'`,
        };
      }

      // Find production or primary environment
      const targetEnv =
        matchingProject.environments.find(
          (e: { isProduction: boolean }) => e.isProduction,
        ) || matchingProject.environments[0];

      if (!targetEnv) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: "FAILED" },
        });
        throw new NotFoundException(
          `No target environment found for project ${matchingProject.name}`,
        );
      }

      // Trigger deployment
      const deployment = await this.deploymentsService.trigger({
        projectId: matchingProject.id,
        environmentId: targetEnv.id,
        commitSha: commitSha || "unknown",
        commitMessage,
        branch: targetBranch,
        trigger: DeploymentTrigger.GITHUB_WEBHOOK,
      });

      // Audit Log
      await this.prisma.auditLog.create({
        data: {
          projectId: matchingProject.id,
          action: AuditAction.WEBHOOK_RECEIVED,
          metadata: {
            deliveryId,
            event: "push",
            ref,
            commitSha,
            deploymentId: deployment.id,
          },
        },
      });

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "PROCESSED" },
      });

      this.logger.log(
        `Auto-deployment triggered for project ${matchingProject.name} (${matchingProject.slug}) on branch ${targetBranch} at commit ${commitSha?.substring(0, 7)}`,
      );

      return {
        processed: true,
        deploymentId: deployment.id,
        projectId: matchingProject.id,
        projectSlug: matchingProject.slug,
        commitSha,
        branch: targetBranch,
      };
    }

    // Other unsupported events
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "IGNORED" },
    });

    return {
      processed: false,
      reason: `Event '${event}' is not monitored for auto-deployment`,
    };
  }
}
