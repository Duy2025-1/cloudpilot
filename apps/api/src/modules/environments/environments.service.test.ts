import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnvironmentsService } from "./environments.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { decryptSecret } from "@cloudpilot/shared";
import { ProjectRole, AuditAction } from "@cloudpilot/database";
import { ForbiddenException, NotFoundException } from "@nestjs/common";

describe("EnvironmentsService", () => {
  let service: EnvironmentsService;
  let prisma: PrismaService;
  const masterKey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = masterKey;

    prisma = {
      environment: {
        findUnique: vi.fn(),
      },
      environmentVariable: {
        upsert: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" }),
      },
    } as unknown as PrismaService;

    service = new EnvironmentsService(prisma);
  });

  it("should encrypt secret values before persisting and return masked value", async () => {
    vi.mocked(prisma.environment.findUnique).mockResolvedValueOnce({
      id: "env_1",
      name: "Production",
      projectId: "proj_1",
      project: {
        id: "proj_1",
        members: [{ userId: "user_owner", role: ProjectRole.OWNER }],
      },
    } as any);

    let savedData: any = null;
    vi.mocked(prisma.environmentVariable.upsert).mockImplementationOnce(
      async (args) => {
        savedData = args.create;
        return {
          id: "var_1",
          environmentId: "env_1",
          key: args.create.key,
          isSecret: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      },
    );

    const result = await service.setEnvVar(
      "env_1",
      {
        key: "DATABASE_PASSWORD",
        value: "ultra_secret_pw",
        isSecret: true,
      },
      "user_owner",
      "DEVELOPER",
    );

    // 1. Result returned must be masked!
    expect(result.value).toBe("••••••••");
    expect(result.key).toBe("DATABASE_PASSWORD");

    // 2. Data passed to prisma must NOT be plaintext!
    expect(savedData.encryptedValue).toBeDefined();
    expect(savedData.encryptedValue).not.toBe("ultra_secret_pw");
    expect(savedData.iv).toBeDefined();
    expect(savedData.authTag).toBeDefined();

    // 3. Decrypting the persisted data with masterKey must yield original secret
    const decrypted = decryptSecret(
      {
        encryptedValue: savedData.encryptedValue,
        iv: savedData.iv,
        authTag: savedData.authTag,
      },
      masterKey,
    );
    expect(decrypted).toBe("ultra_secret_pw");

    // 4. Audit log must be recorded
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("should reject setEnvVar if user has only MEMBER role", async () => {
    vi.mocked(prisma.environment.findUnique).mockResolvedValueOnce({
      id: "env_1",
      name: "Production",
      projectId: "proj_1",
      project: {
        id: "proj_1",
        members: [{ userId: "user_member", role: ProjectRole.MEMBER }],
      },
    } as any);

    await expect(
      service.setEnvVar(
        "env_1",
        { key: "TEST_KEY", value: "value" },
        "user_member",
        "DEVELOPER",
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should allow OWNER or ADMIN to reveal secret and record audit log", async () => {
    vi.mocked(prisma.environment.findUnique).mockResolvedValueOnce({
      id: "env_1",
      name: "Production",
      projectId: "proj_1",
      project: {
        id: "proj_1",
        members: [{ userId: "user_admin", role: ProjectRole.MAINTAINER }],
      },
    } as any);

    const encrypted = service["masterKey"];
    const { encryptSecret } = await import("@cloudpilot/shared");
    const enc = encryptSecret("revealed_secret_123", encrypted);

    vi.mocked(prisma.environmentVariable.findUnique).mockResolvedValueOnce({
      id: "var_sec",
      environmentId: "env_1",
      key: "API_SECRET",
      encryptedValue: enc.encryptedValue,
      iv: enc.iv,
      authTag: enc.authTag,
      isSecret: true,
    } as any);

    const result = await service.revealEnvVar(
      "env_1",
      "API_SECRET",
      "user_admin",
      "DEVELOPER",
    );

    expect(result.key).toBe("API_SECRET");
    expect(result.value).toBe("revealed_secret_123");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.ENV_UPDATE,
          metadata: expect.objectContaining({ event: "SECRET_REVEALED" }),
        }),
      }),
    );
  });

  it("should throw NotFoundException if variable does not exist on delete", async () => {
    vi.mocked(prisma.environment.findUnique).mockResolvedValueOnce({
      id: "env_1",
      name: "Production",
      projectId: "proj_1",
      project: {
        id: "proj_1",
        members: [{ userId: "user_owner", role: ProjectRole.OWNER }],
      },
    } as any);

    vi.mocked(prisma.environmentVariable.findUnique).mockResolvedValueOnce(
      null,
    );

    await expect(
      service.deleteEnvVar("env_1", "NON_EXISTENT", "user_owner", "DEVELOPER"),
    ).rejects.toThrow(NotFoundException);
  });
});
