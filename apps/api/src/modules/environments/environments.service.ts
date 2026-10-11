import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SetEnvVarDto } from "./dto/set-env-var.dto.js";
import { encryptSecret } from "@cloudpilot/shared";

@Injectable()
export class EnvironmentsService {
  private readonly logger = new Logger(EnvironmentsService.name);
  private readonly masterKey: string;

  constructor(private readonly prisma: PrismaService) {
    this.masterKey =
      process.env.ENCRYPTION_MASTER_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }

  async setEnvVar(environmentId: string, dto: SetEnvVarDto) {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
    });
    if (!environment) {
      throw new NotFoundException(`Environment '${environmentId}' not found`);
    }

    const isSecret = dto.isSecret ?? true;
    const encrypted = encryptSecret(dto.value, this.masterKey);

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

    this.logger.log(
      `Set environment variable '${dto.key}' on environment '${environmentId}' (secret: ${isSecret})`,
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

  async getEnvVars(environmentId: string) {
    const environment = await this.prisma.environment.findUnique({
      where: { id: environmentId },
    });
    if (!environment) {
      throw new NotFoundException(`Environment '${environmentId}' not found`);
    }

    const vars = await this.prisma.environmentVariable.findMany({
      where: { environmentId },
      orderBy: { key: "asc" },
    });

    return vars.map((v) => ({
      id: v.id,
      environmentId: v.environmentId,
      key: v.key,
      value: v.isSecret ? "••••••••" : "[Masked]",
      isSecret: v.isSecret,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    }));
  }

  async deleteEnvVar(environmentId: string, key: string) {
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

    return { deleted: true, key };
  }
}
