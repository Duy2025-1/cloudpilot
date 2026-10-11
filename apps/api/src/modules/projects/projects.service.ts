import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { CreateProjectDto } from "./dto/create-project.dto.js";
import { ProjectRole, Role, AuditAction } from "@cloudpilot/database";
import { AuthenticatedUser } from "../auth/decorators/current-user.decorator.js";

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateProjectDto,
    user: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Check slug collision
    const existing = await this.prisma.project.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Project with slug '${dto.slug}' already exists`,
      );
    }

    // SSRF Protection: Reject private/loopback/cloud metadata IP addresses
    const forbiddenHostPattern =
      /(^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\]))/i;
    if (forbiddenHostPattern.test(dto.repositoryUrl)) {
      throw new BadRequestException(
        "Repository URL cannot target loopback, private network, or cloud metadata addresses (SSRF protection)",
      );
    }

    // Create project with default environments and owner membership in a single transaction
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          repositoryUrl: dto.repositoryUrl,
          repositoryId: dto.repositoryId,
          repositoryFullName: dto.repositoryFullName,
          repositoryOwner: dto.repositoryOwner,
          defaultBranch: dto.defaultBranch || "main",
          autoDeployBranch: dto.autoDeployBranch || dto.defaultBranch || "main",
          autoDeployEnabled: dto.autoDeployEnabled ?? true,
          webhookSecret: dto.webhookSecret,
          port: dto.port || 3000,
          rootDirectory: dto.rootDirectory,
          buildCommand: dto.buildCommand,
          startCommand: dto.startCommand,
          ownerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: ProjectRole.OWNER,
            },
          },
          environments: {
            create: [
              { name: "Production", slug: "production", isProduction: true },
              { name: "Staging", slug: "staging", isProduction: false },
            ],
          },
        },
        include: {
          environments: true,
          members: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          projectId: project.id,
          action: AuditAction.PROJECT_CREATE,
          metadata: { name: project.name, slug: project.slug },
          ipAddress,
          userAgent,
        },
      });

      this.logger.log(
        `Project created: ${project.name} (${project.slug}) by user ${user.email}`,
      );
      return project;
    });
  }

  async findAll(user?: AuthenticatedUser) {
    const where =
      user && user.role !== Role.ADMIN
        ? {
            members: {
              some: {
                userId: user.id,
              },
            },
          }
        : {};

    return this.prisma.project.findMany({
      where,
      include: {
        environments: true,
        _count: {
          select: {
            deployments: true,
            members: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(idOrSlug: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        environments: {
          include: {
            _count: { select: { deployments: true, envVars: true } },
          },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        deployments: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project '${idOrSlug}' not found`);
    }

    return project;
  }

  async delete(idOrSlug: string, user: AuthenticatedUser) {
    const project = await this.findOne(idOrSlug);

    await this.prisma.project.delete({
      where: { id: project.id },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.PROJECT_DELETE,
        metadata: { projectId: project.id, slug: project.slug },
      },
    });

    this.logger.log(`Project deleted: ${project.name} by ${user.email}`);
    return { deleted: true, id: project.id };
  }
}
