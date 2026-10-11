import path from "path";
import {
  PrismaClient,
  DeploymentStatus,
  ReleaseStatus,
  ProjectStatus,
  AuditAction,
} from "@cloudpilot/database";
import { DeploymentJobPayload } from "@cloudpilot/shared";
import { WorkerLogger } from "./logger.service.js";
import { GitService } from "./git.service.js";
import { DockerService } from "./docker.service.js";
import { config } from "../config.js";

export class DeploymentRunnerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: WorkerLogger,
    private readonly git: GitService,
    private readonly docker: DockerService,
  ) {}

  /**
   * Executes the full deployment state machine pipeline
   */
  async runDeployment(payload: DeploymentJobPayload): Promise<void> {
    const {
      deploymentId,
      projectId,
      environmentId,
      commitSha,
      branch,
      repositoryUrl,
      rootDirectory,
      port,
      memoryLimitMb,
      cpuLimit,
      envVars,
      isRollback,
      imageTag: existingImageTag,
    } = payload;

    const startTime = Date.now();
    const shortSha = commitSha.substring(0, 7);
    const shortDepId = deploymentId.substring(0, 8);
    const workspaceDir = path.join(config.workspaceDir, deploymentId);

    // Get project & environment slugs for readable image and container naming
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true, name: true },
    });
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      select: { slug: true, name: true },
    });

    const projectSlug = project?.slug || "app";
    const envSlug = environment?.slug || "env";
    const imageTag =
      existingImageTag ||
      `cloudpilot/${projectSlug}:${envSlug}-${shortSha}-${shortDepId}`;
    const containerName = `cloudpilot-${projectSlug}-${envSlug}-${shortDepId}`;

    let candidateContainerId: string | undefined;
    let candidatePort: number | undefined;

    try {
      // 1. Initial verification & status update to CLONING
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.CLONING,
          startedAt: new Date(),
        },
      });

      await this.logger.info(
        deploymentId,
        "SETUP",
        `Initiating deployment pipeline for branch '${branch}' at commit ${shortSha}...`,
      );

      // 2. Step: CLONE (or skip if existing built image for rollback)
      let needsBuild = true;
      if (isRollback && existingImageTag) {
        await this.logger.info(
          deploymentId,
          "ROLLBACK",
          `Rollback triggered with existing validated image '${existingImageTag}'. Skipping clone & build.`,
        );
        needsBuild = false;
      } else {
        await this.git.cloneAndCheckout(
          deploymentId,
          repositoryUrl,
          commitSha,
          workspaceDir,
        );
      }

      // 3. Step: BUILD
      let imageDigest: string | undefined;
      if (needsBuild) {
        // Transition to BUILDING
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: DeploymentStatus.BUILDING },
        });

        const buildResult = await this.docker.buildImage(
          deploymentId,
          workspaceDir,
          imageTag,
          rootDirectory,
          port,
        );

        imageDigest = buildResult.imageDigest;

        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            imageTag,
            imageDigest,
          },
        });
      }

      // 4. Step: DEPLOY
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: DeploymentStatus.DEPLOYING },
      });

      const runResult = await this.docker.runContainer(
        deploymentId,
        containerName,
        imageTag,
        port,
        memoryLimitMb,
        cpuLimit,
        envVars,
      );

      candidateContainerId = runResult.containerId;
      candidatePort = runResult.hostPort;

      // 5. Step: HEALTH_CHECKING
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.HEALTH_CHECKING,
          containerId: candidateContainerId,
          containerPort: candidatePort,
        },
      });

      const isHealthy = await this.docker.checkHealth(
        deploymentId,
        candidatePort,
        45000,
        2000,
      );

      if (!isHealthy) {
        // Transition to TIMED_OUT or FAILED
        await this.logger.error(
          deploymentId,
          "HEALTHCHECK",
          "Health check failed. Rolling back candidate container and preserving active release.",
        );

        // Teardown candidate container
        if (candidateContainerId) {
          await this.docker.stopAndRemoveContainer(candidateContainerId);
        }

        const durationMs = Date.now() - startTime;
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: DeploymentStatus.TIMED_OUT,
            finishedAt: new Date(),
            durationMs,
            errorDetails: "Health check timed out. Container did not respond.",
          },
        });

        return;
      }

      // 6. Zero-Downtime Release Promotion
      await this.logger.info(
        deploymentId,
        "RELEASE",
        "Promoting new release and safely retiring previous active container...",
      );

      // Fetch existing releases to calculate sequential version number
      const prevReleases = await this.prisma.release.findMany({
        where: { environmentId },
        orderBy: { version: "desc" },
      });

      const nextVersion = (prevReleases[0]?.version || 0) + 1;

      // Find currently active release for this environment
      const currentActive = prevReleases.find(
        (r) => r.status === ReleaseStatus.ACTIVE,
      );

      // Create new active release
      const newRelease = await this.prisma.release.create({
        data: {
          projectId,
          environmentId,
          deploymentId,
          version: nextVersion,
          status: ReleaseStatus.ACTIVE,
          imageTag,
          activeContainerId: candidateContainerId,
          activePort: candidatePort,
        },
      });

      // Retire previous active release and stop its container
      if (currentActive) {
        await this.prisma.release.update({
          where: { id: currentActive.id },
          data: {
            status: ReleaseStatus.INACTIVE,
            retiredAt: new Date(),
          },
        });

        if (currentActive.activeContainerId) {
          await this.logger.info(
            deploymentId,
            "RELEASE",
            `Stopping previous release v${currentActive.version} container '${currentActive.activeContainerId}'...`,
          );
          await this.docker.stopAndRemoveContainer(
            currentActive.activeContainerId,
          );
        }
      }

      // Mark deployment as SUCCEEDED
      const durationMs = Date.now() - startTime;
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.SUCCEEDED,
          containerId: candidateContainerId,
          containerPort: candidatePort,
          imageTag,
          imageDigest,
          finishedAt: new Date(),
          durationMs,
        },
      });

      // Update project status to RUNNING
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.RUNNING },
      });

      // Record audit log
      await this.prisma.auditLog.create({
        data: {
          projectId,
          action: AuditAction.RELEASE_ACTIVATE,
          metadata: {
            releaseId: newRelease.id,
            version: newRelease.version,
            deploymentId,
            port: candidatePort,
          },
        },
      });

      await this.logger.info(
        deploymentId,
        "SUCCESS",
        `🎉 Deployment succeeded! Application is live at http://${config.baseDomain}:${candidatePort} (Duration: ${(durationMs / 1000).toFixed(1)}s)`,
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.logger.error(
        deploymentId,
        "FAILED",
        `Deployment failed with error: ${err.message}`,
      );

      // Teardown candidate container if created
      if (candidateContainerId) {
        await this.docker.stopAndRemoveContainer(candidateContainerId);
      }

      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          durationMs,
          errorDetails: err.message,
        },
      });

      throw err;
    } finally {
      // Clean up isolated workspace
      await this.git.cleanupWorkspace(workspaceDir);
    }
  }
}
