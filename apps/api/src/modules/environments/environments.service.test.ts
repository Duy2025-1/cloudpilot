import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnvironmentsService } from "./environments.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { decryptSecret } from "@cloudpilot/shared";

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
    } as unknown as PrismaService;

    service = new EnvironmentsService(prisma);
  });

  it("should encrypt secret values before persisting and return masked value", async () => {
    vi.mocked(prisma.environment.findUnique).mockResolvedValueOnce({
      id: "env_1",
      name: "Production",
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

    const result = await service.setEnvVar("env_1", {
      key: "DATABASE_PASSWORD",
      value: "ultra_secret_pw",
      isSecret: true,
    });

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
  });
});
