import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeploymentsService } from "./deployments.service.js";
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import {
  DeploymentStatus,
  DeploymentTrigger,
  AuditAction,
  ProjectRole,
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
      projectMember: {
        findUnique: vi.fn().mockResolvedValue({ role: ProjectRole.OWNER }),
        findMany: vi.fn().mockResolvedValue([{ projectId: "proj_1" }]),
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
        count: vi.fn().mockResolvedValue(1),
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
      enqueueDeployment: vi.fn().mockResolvedValue(true),
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
        "DEVELOPER",
      );

      expect(res.id).toBe("dep_123");
      expect(mockQueueService.enqueueDeployment).toHaveBeenCalledWith(
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

    it("should throw ForbiddenException if user is not a project member", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: "proj_1",
        name: "My App",
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.trigger(
          {
            projectId: "proj_1",
            environmentId: "env_1",
            commitSha: "a1b2c3d4e5f67890123456789012345678901234",
          },
          "stranger_user",
          "DEVELOPER",
        ),
      ).rejects.toThrow(ForbiddenException);
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
        triggeredById: "user_1",
      });

      mockPrisma.deployment.update.mockResolvedValue({
        id: "dep_123",
        status: DeploymentStatus.CANCELLED,
      });

      const res = await service.cancel("dep_123", "user_1", "DEVELOPER");
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
        projectId: "proj_1",
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
        "DEVELOPER",
      );

      expect(res.id).toBe("dep_rollback_1");
      expect(mockQueueService.enqueueDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: "dep_rollback_1",
          isRollback: true,
          rollbackFromReleaseId: "rel_target",
          imageTag: "cloudpilot/my-app:production-v1",
        }),
      );
    });

    it("should reject rollback if user is only a MEMBER", async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: "proj_1",
        name: "My App",
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        role: ProjectRole.MEMBER,
      });

      await expect(
        service.rollback(
          {
            projectId: "proj_1",
            environmentId: "env_1",
            targetReleaseId: "rel_target",
          },
          "regular_member",
          "DEVELOPER",
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("Logs & Pagination", () => {
    it("should return sequential deployment logs within limit", async () => {
      mockPrisma.deployment.findUnique.mockResolvedValue({
        id: "dep_1",
        projectId: "proj_1",
      });
      mockPrisma.deploymentLog.findMany.mockResolvedValue([
        { id: "log_1", step: "CLONE", message: "Cloning repo..." },
        { id: "log_2", step: "BUILD", message: "Building image..." },
      ]);

      const logs = await service.getLogs("dep_1", "user_1", "DEVELOPER");
      expect(logs).toHaveLength(2);
      expect(logs[0]?.step).toBe("CLONE");
    });

    it("should reject log access for non-members", async () => {
      mockPrisma.deployment.findUnique.mockResolvedValue({
        id: "dep_1",
        projectId: "proj_1",
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.getLogs("dep_1", "intruder", "DEVELOPER"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should paginate findAll results with page and limit", async () => {
      mockPrisma.deployment.count.mockResolvedValue(45);
      mockPrisma.deployment.findMany.mockResolvedValue([
        { id: "dep_1", status: DeploymentStatus.SUCCEEDED },
      ]);

      const result = await service.findAll(
        "proj_1",
        undefined,
        "user_owner",
        "DEVELOPER",
        2,
        10,
      );

      expect(result.pagination.total).toBe(45);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.totalPages).toBe(5);
      expect(result.data).toHaveLength(1);
    });
  });
});
