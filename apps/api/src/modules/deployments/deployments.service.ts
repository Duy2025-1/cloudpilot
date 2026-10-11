import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { TriggerDeploymentDto } from "./dto/trigger-deployment.dto.js";
import {
  DeploymentStatus,
  DeploymentTrigger,
  LogLevel,
} from "@cloudpilot/database";

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
            message: `Deployment triggered for commit ${dto.commitSha.substring(0, 7)} on branch ${branch}`,
          },
        },
      },
      include: {
        logs: true,
      },
    });

    this.logger.log(
      `Deployment ${deployment.id} created and queued for project ${project.name}`,
    );
    return deployment;
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
