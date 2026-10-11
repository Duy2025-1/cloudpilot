import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { CreateProjectDto } from "./dto/create-project.dto.js";
import { ProjectRole } from "@cloudpilot/database";

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto, ownerId?: string) {
    // Check slug collision
    const existing = await this.prisma.project.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Project with slug '${dto.slug}' already exists`,
      );
    }

    // Fallback owner if not provided (for development/seed purposes)
    let actualOwnerId = ownerId;
    if (!actualOwnerId) {
      const firstUser = await this.prisma.user.findFirst();
      if (!firstUser) {
        throw new NotFoundException(
          "No user exists in the system to assign as project owner",
        );
      }
      actualOwnerId = firstUser.id;
    }

    // Create project with default environments in a single transaction
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          repositoryUrl: dto.repositoryUrl,
          defaultBranch: dto.defaultBranch || "main",
          port: dto.port || 3000,
          rootDirectory: dto.rootDirectory,
          buildCommand: dto.buildCommand,
          startCommand: dto.startCommand,
          ownerId: actualOwnerId!,
          members: {
            create: {
              userId: actualOwnerId!,
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

      this.logger.log(
        `Project created: ${project.name} (${project.slug}) by user ${actualOwnerId}`,
      );
      return project;
    });
  }

  async findAll() {
    return this.prisma.project.findMany({
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
      },
    });

    if (!project) {
      throw new NotFoundException(`Project '${idOrSlug}' not found`);
    }

    return project;
  }
}
