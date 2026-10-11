import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
  ProjectRole,
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

  async trigger(dto: TriggerDeploymentDto, userId?: string, userRole?: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project '${dto.projectId}' not found`);
    }

    // Verify user is a member of this project
    if (userId && userRole !== "ADMIN") {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: dto.projectId, userId },
        },
      });
      if (!member) {
        throw new ForbiddenException("You are not a member of this project");
      }
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

    // Enqueue job to BullMQ
    const jobPayload: DeploymentJobPayload = {
      deploymentId: deployment.id,
      projectId: project.id,
      projectName: project.name,
      environmentId: environment.id,
      environmentName: environment.name,
      commitSha: dto.commitSha,
      branch,
      repositoryUrl: project.repositoryUrl,
      rootDirectory: project.rootDirectory ?? undefined,
      port: project.port,
      memoryLimitMb: project.memoryLimitMb,
      cpuLimit: project.cpuLimit,
      envVars: decryptedEnvVars,
      trigger: deployment.trigger,
      isRollback: false,
    };

    await this.queueService.enqueueDeployment(jobPayload);

    // Audit log
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

  async cancel(id: string, userId?: string, userRole?: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${id}' not found`);
    }

    // Object-level permission check
    if (userId && userRole !== "ADMIN") {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: deployment.projectId, userId },
        },
      });
      const isOwnerOrAdmin =
        member &&
        ([ProjectRole.OWNER, ProjectRole.MAINTAINER] as ProjectRole[]).includes(
          member.role,
        );
      const isTriggerer = deployment.triggeredById === userId;

      if (!member || (!isOwnerOrAdmin && !isTriggerer)) {
        throw new ForbiddenException(
          "Insufficient permissions: Only project OWNER, MAINTAINER, or the deployment initiator can cancel this deployment",
        );
      }
    }

    const terminalStatuses: DeploymentStatus[] = [
      DeploymentStatus.SUCCEEDED,
      DeploymentStatus.FAILED,
      DeploymentStatus.CANCELLED,
      DeploymentStatus.TIMED_OUT,
    ];

    if (terminalStatuses.includes(deployment.status)) {
      throw new BadRequestException(
        `Cannot cancel deployment '${id}' because it is already in terminal state '${deployment.status}'`,
      );
    }

    // Try to remove from BullMQ queue
    await this.queueService.cancelJob(id);

    const updated = await this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.CANCELLED,
        finishedAt: new Date(),
        logs: {
          create: {
            level: LogLevel.WARN,
            step: "CANCEL",
            message: `Deployment cancelled by user ${userId || "system"}`,
          },
        },
      },
    });

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

  async rollback(
    dto: RollbackDeploymentDto,
    userId?: string,
    userRole?: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project '${dto.projectId}' not found`);
    }

    // Check project permission: Only OWNER or ADMIN can trigger rollback
    if (userId && userRole !== "ADMIN") {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: dto.projectId, userId },
        },
      });
      if (
        !member ||
        !(
          [ProjectRole.OWNER, ProjectRole.MAINTAINER] as ProjectRole[]
        ).includes(member.role)
      ) {
        throw new ForbiddenException(
          "Only project OWNER or MAINTAINER can perform rollbacks",
        );
      }
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
      } catch (err: any) {
        this.logger.error(
          `Failed to decrypt env var '${ev.key}' during rollback: ${err.message}`,
        );
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
        triggeredById: userId,
        imageTag: targetRelease.imageTag,
        logs: {
          create: {
            level: LogLevel.INFO,
            step: "QUEUE",
            message: `Rollback deployment queued targeting Release v${targetRelease.version}`,
          },
        },
      },
    });

    const jobPayload: DeploymentJobPayload = {
      deploymentId: rollbackDeployment.id,
      projectId: project.id,
      projectName: project.name,
      environmentId: environment.id,
      environmentName: environment.name,
      commitSha: targetRelease.deployment.commitSha,
      branch: targetRelease.deployment.branch,
      repositoryUrl: project.repositoryUrl,
      rootDirectory: project.rootDirectory ?? undefined,
      port: project.port,
      memoryLimitMb: project.memoryLimitMb,
      cpuLimit: project.cpuLimit,
      envVars: decryptedEnvVars,
      trigger: DeploymentTrigger.ROLLBACK,
      isRollback: true,
      rollbackFromReleaseId: targetRelease.id,
      imageTag: targetRelease.imageTag ?? undefined,
    };

    await this.queueService.enqueueDeployment(jobPayload);

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

  async getLogs(id: string, userId?: string, userRole?: string, limit = 500) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${id}' not found`);
    }

    // Verify project access
    if (userId && userRole !== "ADMIN") {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: deployment.projectId, userId },
        },
      });
      if (!member) {
        throw new ForbiddenException(
          "You do not have permission to view logs for this deployment",
        );
      }
    }

    const safeLimit = Math.min(Math.max(1, limit), 2000);

    return this.prisma.deploymentLog.findMany({
      where: { deploymentId: id },
      orderBy: { createdAt: "asc" },
      take: safeLimit,
    });
  }

  async findAll(
    projectId?: string,
    environmentId?: string,
    userId?: string,
    userRole?: string,
    page = 1,
    limit = 20,
  ) {
    const where: any = {};
    if (environmentId) where.environmentId = environmentId;

    if (userId && userRole !== "ADMIN") {
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const allowedIds = memberships.map((m) => m.projectId);

      if (projectId) {
        if (!allowedIds.includes(projectId)) {
          throw new ForbiddenException(
            "You do not have access to this project",
          );
        }
        where.projectId = projectId;
      } else {
        where.projectId = { in: allowedIds };
      }
    } else if (projectId) {
      where.projectId = projectId;
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const [total, items] = await Promise.all([
      this.prisma.deployment.count({ where }),
      this.prisma.deployment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit,
        include: {
          project: { select: { id: true, name: true, slug: true } },
          environment: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      data: items,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findOne(id: string, userId?: string, userRole?: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: {
        project: true,
        environment: true,
        logs: {
          orderBy: { createdAt: "asc" },
          take: 200,
        },
        releases: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException(`Deployment '${id}' not found`);
    }

    if (userId && userRole !== "ADMIN") {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: deployment.projectId, userId },
        },
      });
      if (!member) {
        throw new ForbiddenException(
          "You do not have access to this deployment",
        );
      }
    }

    return deployment;
  }
}
