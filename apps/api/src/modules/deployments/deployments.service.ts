import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { TriggerDeploymentDto } from "./dto/trigger-deployment.dto.js";
import { RollbackDeploymentDto } from "./dto/rollback-deployment.dto.js";
import { DeploymentQueueService } from "./deployment-queue.service.js";
import {
  DeploymentStatus,
  DeploymentTrigger,
  LogLevel,
  AuditAction,
} from "@cloudpilot/database";
import { decryptSecret, DeploymentJobPayload } from "@cloudpilot/shared";

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly queueService: DeploymentQueueService,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>("ENCRYPTION_MASTER_KEY")!;
  }

  async trigger(dto: TriggerDeploymentDto, userId?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project '${dto.projectId}' not found`);
    }

    const environment = await this.prisma.environment.findFirst({
      where: {
        id: dto.environmentId,
        projectId: dto.projectId,
      },
    });
    if (!environment) {
      throw new NotFoundException(
        `Environment '${dto.environmentId}' does not belong to Project '${dto.projectId}'`,
      );
    }

    const branch = dto.branch || project.defaultBranch;

    // Decrypt environment variables for this environment
    const rawEnvVars = await this.prisma.environmentVariable.findMany({
      where: { environmentId: environment.id },
    });

    const decryptedEnvVars: Record<string, string> = {};
    for (const ev of rawEnvVars) {
      try {
        decryptedEnvVars[ev.key] = decryptSecret(
          {
            encryptedValue: ev.encryptedValue,
            iv: ev.iv,
            authTag: ev.authTag,
          },
          this.encryptionKey,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to decrypt env var '${ev.key}' for env '${environment.id}': ${err.message}`,
        );
      }
    }

    const deployment = await this.prisma.deployment.create({
      data: {
        projectId: project.id,
        environmentId: environment.id,
        commitSha: dto.commitSha,
        commitMessage: dto.commitMessage,
        branch,
        status: DeploymentStatus.QUEUED,
        trigger: dto.trigger || DeploymentTrigger.MANUAL,
        triggeredById: userId,
        logs: {
          create: {
            level: LogLevel.INFO,
            step: "QUEUE",
            message: `Deployment queued for commit ${dto.commitSha.substring(0, 7)} on branch '${branch}'`,
          },
        },
      },
      include: {
        logs: true,
      },
    });

    // Enqueue to BullMQ
    const jobPayload: DeploymentJobPayload = {
      deploymentId: deployment.id,
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      environmentId: environment.id,
      environmentName: environment.name,
      environmentSlug: environment.slug,
      repositoryUrl: project.repositoryUrl,
      commitSha: dto.commitSha,
      branch,
      rootDirectory: project.rootDirectory,
      buildCommand: project.buildCommand,
      startCommand: project.startCommand,
      port: project.port,
      memoryLimitMb: project.memoryLimitMb,
      cpuLimit: project.cpuLimit,
      envVars: decryptedEnvVars,
      trigger: dto.trigger || DeploymentTrigger.MANUAL,
      triggeredById: userId,
    };

    await this.queueService.addJob(jobPayload);

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId: project.id,
        action: AuditAction.DEPLOYMENT_TRIGGER,
        metadata: {
          deploymentId: deployment.id,
          commitSha: dto.commitSha,
          branch,
          trigger: deployment.trigger,
        },
      },
    });

    this.logger.log(
      `Deployment ${deployment.id} created and queued for project ${project.name}`,
    );
    return deployment;
  }

  async cancel(id: string, userId?: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${id}' not found`);
    }

    const terminalStatuses: DeploymentStatus[] = [
      DeploymentStatus.SUCCEEDED,
      DeploymentStatus.SUCCESS,
      DeploymentStatus.FAILED,
      DeploymentStatus.CANCELLED,
      DeploymentStatus.TIMED_OUT,
      DeploymentStatus.ROLLED_BACK,
    ];

    if (terminalStatuses.includes(deployment.status)) {
      throw new BadRequestException(
        `Cannot cancel deployment '${id}' because it is already in terminal status '${deployment.status}'`,
      );
    }

    const updated = await this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.CANCELLED,
        finishedAt: new Date(),
        logs: {
          create: {
            level: LogLevel.WARN,
            step: "CANCEL",
            message: `Deployment cancelled by user${userId ? ` (${userId})` : ""}`,
          },
        },
      },
      include: { logs: true },
    });

    await this.queueService.cancelJob(id);

    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId: deployment.projectId,
        action: AuditAction.DEPLOYMENT_CANCEL,
        metadata: { deploymentId: id },
      },
    });

    this.logger.log(`Deployment ${id} marked CANCELLED`);
    return updated;
  }

  async rollback(dto: RollbackDeploymentDto, userId?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project '${dto.projectId}' not found`);
    }

    const environment = await this.prisma.environment.findFirst({
      where: { id: dto.environmentId, projectId: dto.projectId },
    });
    if (!environment) {
      throw new NotFoundException(
        `Environment '${dto.environmentId}' does not belong to Project '${dto.projectId}'`,
      );
    }

    const targetRelease = await this.prisma.release.findFirst({
      where: {
        id: dto.targetReleaseId,
        environmentId: dto.environmentId,
      },
      include: {
        deployment: true,
      },
    });

    if (!targetRelease || !targetRelease.deployment) {
      throw new NotFoundException(
        `Target release '${dto.targetReleaseId}' not found for rollback`,
      );
    }

    // Decrypt environment variables
    const rawEnvVars = await this.prisma.environmentVariable.findMany({
      where: { environmentId: environment.id },
    });
    const decryptedEnvVars: Record<string, string> = {};
    for (const ev of rawEnvVars) {
      try {
        decryptedEnvVars[ev.key] = decryptSecret(
          {
            encryptedValue: ev.encryptedValue,
            iv: ev.iv,
            authTag: ev.authTag,
          },
          this.encryptionKey,
        );
      } catch {
        // Continue
      }
    }

    const rollbackDeployment = await this.prisma.deployment.create({
      data: {
        projectId: project.id,
        environmentId: environment.id,
        commitSha: targetRelease.deployment.commitSha,
        commitMessage: `Rollback to Release v${targetRelease.version} (${targetRelease.deployment.commitSha.substring(0, 7)})`,
        branch: targetRelease.deployment.branch,
        status: DeploymentStatus.QUEUED,
        trigger: DeploymentTrigger.ROLLBACK,
        rollbackFromId: targetRelease.deploymentId,
        imageTag: targetRelease.imageTag,
        triggeredById: userId,
        logs: {
          create: {
            level: LogLevel.INFO,
            step: "QUEUE",
            message: `Rollback queued targeting Release v${targetRelease.version} (Commit ${targetRelease.deployment.commitSha.substring(0, 7)})`,
          },
        },
      },
      include: {
        logs: true,
      },
    });

    // Enqueue rollback job
    const jobPayload: DeploymentJobPayload = {
      deploymentId: rollbackDeployment.id,
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      environmentId: environment.id,
      environmentName: environment.name,
      environmentSlug: environment.slug,
      repositoryUrl: project.repositoryUrl,
      commitSha: targetRelease.deployment.commitSha,
      branch: targetRelease.deployment.branch,
      rootDirectory: project.rootDirectory,
      buildCommand: project.buildCommand,
      startCommand: project.startCommand,
      port: project.port,
      memoryLimitMb: project.memoryLimitMb,
      cpuLimit: project.cpuLimit,
      envVars: decryptedEnvVars,
      trigger: DeploymentTrigger.ROLLBACK,
      triggeredById: userId,
      isRollback: true,
      rollbackFromReleaseId: targetRelease.id,
      imageTag: targetRelease.imageTag || undefined,
    };

    await this.queueService.addJob(jobPayload);

    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId: project.id,
        action: AuditAction.DEPLOYMENT_ROLLBACK,
        metadata: {
          deploymentId: rollbackDeployment.id,
          targetReleaseId: targetRelease.id,
          targetVersion: targetRelease.version,
        },
      },
    });

    this.logger.log(
      `Rollback deployment ${rollbackDeployment.id} queued targeting Release v${targetRelease.version}`,
    );

    return rollbackDeployment;
  }

  async getLogs(id: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${id}' not found`);
    }

    return this.prisma.deploymentLog.findMany({
      where: { deploymentId: id },
      orderBy: { createdAt: "asc" },
    });
  }

  async findAll(projectId?: string, environmentId?: string) {
    return this.prisma.deployment.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(environmentId ? { environmentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        project: { select: { id: true, name: true, slug: true } },
        environment: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async findOne(id: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: {
        project: true,
        environment: true,
        logs: {
          orderBy: { createdAt: "asc" },
        },
        releases: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${id}' not found`);
    }

    return deployment;
  }
}
