import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeploymentRunnerService } from "./deployment-runner.service.js";
import { DeploymentStatus, ReleaseStatus } from "@cloudpilot/database";
import { DeploymentJobPayload, DeploymentTrigger } from "@cloudpilot/shared";

describe("DeploymentRunnerService - Core Engine Tests", () => {
  let runner: DeploymentRunnerService;
  let mockPrisma: any;
  let mockLogger: any;
  let mockGit: any;
  let mockDocker: any;

  const samplePayload: DeploymentJobPayload = {
    deploymentId: "dep_test_12345678",
    projectId: "proj_abc",
    projectName: "Sample App",
    projectSlug: "sample-app",
    environmentId: "env_prod",
    environmentName: "Production",
    environmentSlug: "production",
    repositoryUrl: "https://github.com/cloudpilot/sample-app.git",
    commitSha: "a1b2c3d4e5f67890123456789012345678901234",
    branch: "main",
    port: 3000,
    memoryLimitMb: 512,
    cpuLimit: 0.5,
    envVars: { NODE_ENV: "production", PORT: "3000" },
    trigger: DeploymentTrigger.MANUAL,
  };

  beforeEach(() => {
    mockPrisma = {
      project: {
        findUnique: vi.fn().mockResolvedValue({
          slug: "sample-app",
          name: "Sample App",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      environment: {
        findUnique: vi.fn().mockResolvedValue({
          slug: "production",
          name: "Production",
        }),
      },
      deployment: {
        update: vi.fn().mockResolvedValue({}),
      },
      release: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "rel_1", version: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    mockLogger = {
      info: vi.fn().mockResolvedValue(undefined),
      warn: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined),
    };

    mockGit = {
      cloneAndCheckout: vi.fn().mockResolvedValue(undefined),
      cleanupWorkspace: vi.fn().mockResolvedValue(undefined),
    };

    mockDocker = {
      isDockerAvailable: vi.fn().mockResolvedValue(true),
      buildImage: vi.fn().mockResolvedValue({
        imageTag: "cloudpilot/sample-app:production-a1b2c3d-dep_test",
        imageDigest: "sha256:1234567890abcdef",
      }),
      runContainer: vi.fn().mockResolvedValue({
        containerId: "c_123456789abc",
        hostPort: 3200,
      }),
      checkHealth: vi.fn().mockResolvedValue(true),
      stopAndRemoveContainer: vi.fn().mockResolvedValue(undefined),
    };

    runner = new DeploymentRunnerService(
      mockPrisma,
      mockLogger,
      mockGit,
      mockDocker,
    );
  });

  describe("Scenario 1: Build & Deploy Thành Công", () => {
    it("should execute clone, build, deploy, health check and activate new release", async () => {
      // Mock existing release v1
      mockPrisma.release.findMany.mockResolvedValue([
        {
          id: "rel_old",
          version: 1,
          status: ReleaseStatus.ACTIVE,
          activeContainerId: "c_old_container",
          activePort: 3100,
        },
      ]);

      await runner.runDeployment(samplePayload);

      // 1. Cloned repo
      expect(mockGit.cloneAndCheckout).toHaveBeenCalledWith(
        samplePayload.deploymentId,
        samplePayload.repositoryUrl,
        samplePayload.commitSha,
        expect.any(String),
      );

      // 2. Built Docker image
      expect(mockDocker.buildImage).toHaveBeenCalled();

      // 3. Ran container with limits
      expect(mockDocker.runContainer).toHaveBeenCalledWith(
        samplePayload.deploymentId,
        expect.stringContaining("cloudpilot-sample-app-production"),
        expect.any(String),
        3000,
        512,
        0.5,
        samplePayload.envVars,
      );

      // 4. Performed health check
      expect(mockDocker.checkHealth).toHaveBeenCalledWith(
        samplePayload.deploymentId,
        3200,
        45000,
        2000,
      );

      // 5. Retired previous release & stopped old container
      expect(mockPrisma.release.update).toHaveBeenCalledWith({
        where: { id: "rel_old" },
        data: {
          status: ReleaseStatus.INACTIVE,
          retiredAt: expect.any(Date),
        },
      });
      expect(mockDocker.stopAndRemoveContainer).toHaveBeenCalledWith(
        "c_old_container",
      );

      // 6. Promoted new release with incremented version (v2)
      expect(mockPrisma.release.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: "proj_abc",
          environmentId: "env_prod",
          deploymentId: samplePayload.deploymentId,
          version: 2,
          status: ReleaseStatus.ACTIVE,
          activeContainerId: "c_123456789abc",
          activePort: 3200,
        }),
      });

      // 7. Marked deployment SUCCEEDED
      expect(mockPrisma.deployment.update).toHaveBeenCalledWith({
        where: { id: samplePayload.deploymentId },
        data: expect.objectContaining({
          status: DeploymentStatus.SUCCEEDED,
          containerId: "c_123456789abc",
          containerPort: 3200,
        }),
      });

      // 8. Cleaned up workspace
      expect(mockGit.cleanupWorkspace).toHaveBeenCalled();
    });
  });

  describe("Scenario 2: Build Lỗi", () => {
    it("should catch build failure, mark FAILED and not stop active release", async () => {
      mockDocker.buildImage.mockRejectedValue(
        new Error("Dockerfile syntax error: unknown instruction FOOBAR"),
      );

      await expect(runner.runDeployment(samplePayload)).rejects.toThrow(
        "Dockerfile syntax error",
      );

      // Status transitioned to FAILED
      expect(mockPrisma.deployment.update).toHaveBeenCalledWith({
        where: { id: samplePayload.deploymentId },
        data: expect.objectContaining({
          status: DeploymentStatus.FAILED,
          errorDetails: expect.stringContaining("Dockerfile syntax error"),
        }),
      });

      // No container was started or released
      expect(mockDocker.runContainer).not.toHaveBeenCalled();
      expect(mockPrisma.release.create).not.toHaveBeenCalled();

      // Workspace cleaned up
      expect(mockGit.cleanupWorkspace).toHaveBeenCalled();
    });
  });

  describe("Scenario 3: Health Check Timeout (Bảo vệ Zero-Downtime)", () => {
    it("should teardown candidate container and set TIMED_OUT when health check fails, keeping old container alive", async () => {
      mockPrisma.release.findMany.mockResolvedValue([
        {
          id: "rel_old",
          version: 1,
          status: ReleaseStatus.ACTIVE,
          activeContainerId: "c_old_container",
        },
      ]);

      // Health check fails/times out
      mockDocker.checkHealth.mockResolvedValue(false);

      await runner.runDeployment(samplePayload);

      // Candidate container was killed
      expect(mockDocker.stopAndRemoveContainer).toHaveBeenCalledWith(
        "c_123456789abc",
      );

      // Deployment marked TIMED_OUT
      expect(mockPrisma.deployment.update).toHaveBeenCalledWith({
        where: { id: samplePayload.deploymentId },
        data: expect.objectContaining({
          status: DeploymentStatus.TIMED_OUT,
        }),
      });

      // Previous release was NOT touched/retired!
      expect(mockPrisma.release.update).not.toHaveBeenCalled();
      expect(mockDocker.stopAndRemoveContainer).not.toHaveBeenCalledWith(
        "c_old_container",
      );
    });
  });

  describe("Scenario 4: Rollback Release", () => {
    it("should deploy existing image tag directly without re-cloning or re-building", async () => {
      const rollbackPayload: DeploymentJobPayload = {
        ...samplePayload,
        isRollback: true,
        imageTag: "cloudpilot/sample-app:production-v1-validated",
      };

      await runner.runDeployment(rollbackPayload);

      // Did not clone or build
      expect(mockGit.cloneAndCheckout).not.toHaveBeenCalled();
      expect(mockDocker.buildImage).not.toHaveBeenCalled();

      // Ran container using existing validated image
      expect(mockDocker.runContainer).toHaveBeenCalledWith(
        rollbackPayload.deploymentId,
        expect.any(String),
        "cloudpilot/sample-app:production-v1-validated",
        3000,
        512,
        0.5,
        rollbackPayload.envVars,
      );

      // Marked SUCCEEDED
      expect(mockPrisma.deployment.update).toHaveBeenCalledWith({
        where: { id: rollbackPayload.deploymentId },
        data: expect.objectContaining({
          status: DeploymentStatus.SUCCEEDED,
        }),
      });
    });
  });

  describe("Scenario 5: Không tạo nhiều release ACTIVE ngoài ý muốn", () => {
    it("should ensure exactly one ACTIVE release per environment after promotion", async () => {
      const activeOld = {
        id: "rel_active_1",
        version: 1,
        status: ReleaseStatus.ACTIVE,
        activeContainerId: "c_active_1",
      };

      mockPrisma.release.findMany.mockResolvedValue([activeOld]);

      await runner.runDeployment(samplePayload);

      // Old release marked INACTIVE
      expect(mockPrisma.release.update).toHaveBeenCalledWith({
        where: { id: "rel_active_1" },
        data: expect.objectContaining({
          status: ReleaseStatus.INACTIVE,
        }),
      });

      // New release created as ACTIVE
      expect(mockPrisma.release.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: 2,
          status: ReleaseStatus.ACTIVE,
        }),
      });
    });
  });
});
