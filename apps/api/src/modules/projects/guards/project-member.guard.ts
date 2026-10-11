import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PROJECT_ROLE_KEY } from "../decorators/require-project-role.decorator.js";
import { ProjectRole, Role } from "@cloudpilot/database";

const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  [ProjectRole.VIEWER]: 1,
  [ProjectRole.DEVELOPER]: 2,
  [ProjectRole.MAINTAINER]: 3,
  [ProjectRole.OWNER]: 4,
};

@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("User is not authenticated");
    }

    // System Admins always bypass project permission checks
    if (user.role === Role.ADMIN) {
      return true;
    }

    // Extract project identifier from route params or body
    const projectIdOrSlug =
      request.params?.idOrSlug ||
      request.params?.id ||
      request.params?.projectId ||
      request.body?.projectId;

    if (!projectIdOrSlug) {
      return true;
    }

    // Resolve project in database
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
      },
    });

    if (!project) {
      throw new NotFoundException(`Project '${projectIdOrSlug}' not found`);
    }

    // Query membership in database (never trust client-supplied roles!)
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        "You do not have permission to access this project",
      );
    }

    // Check required role level if specified via @RequireProjectRole()
    const requiredRole = this.reflector.getAllAndOverride<ProjectRole>(
      PROJECT_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRole) {
      const userLevel = ROLE_HIERARCHY[membership.role];
      const requiredLevel = ROLE_HIERARCHY[requiredRole];

      if (userLevel < requiredLevel) {
        throw new ForbiddenException(
          `Insufficient permissions: Operation requires role '${requiredRole}', but your role is '${membership.role}'`,
        );
      }
    }

    request.project = project;
    request.projectMember = membership;

    return true;
  }
}
