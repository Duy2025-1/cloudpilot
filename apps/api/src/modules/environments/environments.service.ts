import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SetEnvVarDto } from "./dto/set-env-var.dto.js";
import { encryptSecret, decryptSecret } from "@cloudpilot/shared";
import { AuditAction, ProjectRole } from "@cloudpilot/database";

@Injectable()
export class EnvironmentsService {
  private readonly logger = new Logger(EnvironmentsService.name);
  private readonly masterKey: string;

  constructor(private readonly prisma: PrismaService) {
    this.masterKey =
      process.env.ENCRYPTION_MASTER_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }

  /**
   * Helper to verify object-level access to the project owning this environment
   */
  private async checkProjectAccess(
    environmentId: string,
    userId?: string,
    userRole?: string,
    requiredRoles?: ProjectRole[],
  ) {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
      include: {
        project: {
          include: {
            members: userId ? { where: { userId } } : undefined,
          },
        },
      },
    });

    if (!environment) {
      throw new NotFoundException(`Environment '${environmentId}' not found`);
    }

    // Skip member check if system admin or internal call without userId
    if (!userId || userRole === "ADMIN") {
      return environment;
    }

    const member = environment.project.members[0];
    if (!member) {
      throw new ForbiddenException(
        "You do not have access to this project's environments",
      );
    }

    if (requiredRoles && !requiredRoles.includes(member.role)) {
      throw new ForbiddenException(
        `Insufficient permissions: requires project ${requiredRoles.join(" or ")} role`,
      );
    }

    return environment;
  }

  async setEnvVar(
    environmentId: string,
    dto: SetEnvVarDto,
    userId?: string,
    userRole?: string,
  ) {
    const environment = await this.checkProjectAccess(
      environmentId,
      userId,
      userRole,
      [ProjectRole.OWNER, ProjectRole.MAINTAINER],
    );

    const isSecret = dto.isSecret ?? true;
    const encrypted = encryptSecret(dto.value, this.masterKey);

    const existing = await this.prisma.environmentVariable.findUnique({
      where: {
        environmentId_key: {
          environmentId,
          key: dto.key,
        },
      },
    });

    const envVar = await this.prisma.environmentVariable.upsert({
      where: {
        environmentId_key: {
          environmentId,
          key: dto.key,
        },
      },
      update: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        isSecret,
      },
      create: {
        environmentId,
        key: dto.key,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        isSecret,
      },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId: environment.projectId,
        action: existing ? AuditAction.ENV_UPDATE : AuditAction.ENV_CREATE,
        metadata: {
          environmentId,
          key: dto.key,
          isSecret,
          actionType: existing ? "UPDATE_VARIABLE" : "CREATE_VARIABLE",
        },
      },
    });

    this.logger.log(
      `Set environment variable '${dto.key}' on environment '${environmentId}' (secret: ${isSecret}) by user ${userId || "system"}`,
    );

    // Mask value in return to prevent leaking plaintext
    return {
      id: envVar.id,
      environmentId: envVar.environmentId,
      key: envVar.key,
      value: isSecret ? "••••••••" : dto.value,
      isSecret: envVar.isSecret,
      createdAt: envVar.createdAt,
      updatedAt: envVar.updatedAt,
    };
  }

  async getEnvVars(environmentId: string, userId?: string, userRole?: string) {
    await this.checkProjectAccess(environmentId, userId, userRole);

    const vars = await this.prisma.environmentVariable.findMany({
      where: { environmentId },
      orderBy: { key: "asc" },
    });

    return vars.map((v) => {
      let displayValue = "••••••••";
      if (!v.isSecret) {
        try {
          displayValue = decryptSecret(
            {
              encryptedValue: v.encryptedValue,
              iv: v.iv,
              authTag: v.authTag,
            },
            this.masterKey,
          );
        } catch {
          displayValue = "[Encrypted]";
        }
      }

      return {
        id: v.id,
        environmentId: v.environmentId,
        key: v.key,
        value: displayValue,
        isSecret: v.isSecret,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      };
    });
  }

  async deleteEnvVar(
    environmentId: string,
    key: string,
    userId?: string,
    userRole?: string,
  ) {
    const environment = await this.checkProjectAccess(
      environmentId,
      userId,
      userRole,
      [ProjectRole.OWNER, ProjectRole.MAINTAINER],
    );

    const existing = await this.prisma.environmentVariable.findUnique({
      where: {
        environmentId_key: {
          environmentId,
          key,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Environment variable '${key}' not found in environment '${environmentId}'`,
      );
    }

    await this.prisma.environmentVariable.delete({
      where: { id: existing.id },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId: environment.projectId,
        action: AuditAction.ENV_DELETE,
        metadata: {
          environmentId,
          key,
          actionType: "DELETE_VARIABLE",
        },
      },
    });

    return { deleted: true, key };
  }

  async revealEnvVar(
    environmentId: string,
    key: string,
    userId?: string,
    userRole?: string,
  ) {
    const environment = await this.checkProjectAccess(
      environmentId,
      userId,
      userRole,
      [ProjectRole.OWNER, ProjectRole.MAINTAINER],
    );

    const existing = await this.prisma.environmentVariable.findUnique({
      where: {
        environmentId_key: {
          environmentId,
          key,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Environment variable '${key}' not found in environment '${environmentId}'`,
      );
    }

    const decrypted = decryptSecret(
      {
        encryptedValue: existing.encryptedValue,
        iv: existing.iv,
        authTag: existing.authTag,
      },
      this.masterKey,
    );

    // Record audit log of secret access
    await this.prisma.auditLog.create({
      data: {
        userId,
        projectId: environment.projectId,
        action: AuditAction.ENV_UPDATE,
        metadata: {
          environmentId,
          key,
          event: "SECRET_REVEALED",
        },
      },
    });

    return {
      key: existing.key,
      value: decrypted,
    };
  }
}
