import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  exportDatabaseBackup,
  restoreDatabaseBackup,
  DatabaseBackup,
} from "./backup-restore.js";
import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("Database Backup and Restore", () => {
  let mockPrisma: any;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "cloudpilot-backup-test-"),
    );

    mockPrisma = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "u1", email: "admin@local" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      oAuthAccount: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      project: {
        findMany: vi.fn().mockResolvedValue([{ id: "p1", slug: "my-app" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      projectMember: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      environment: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      environmentVariable: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      deployment: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      deploymentLog: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      release: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      webhookDelivery: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn(async (callback: any) => {
        return callback(mockPrisma);
      }),
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should export database tables into a valid JSON backup file", async () => {
    const backupFile = path.join(tempDir, "test-backup.json");
    const result = await exportDatabaseBackup(
      mockPrisma as unknown as PrismaClient,
      backupFile,
    );

    expect(result.filePath).toBe(backupFile);
    expect(result.backup.version).toBe("1.0.0");
    expect(result.backup.counts.users).toBe(1);
    expect(result.backup.counts.projects).toBe(1);

    const savedContent = JSON.parse(await fs.readFile(backupFile, "utf8"));
    expect(savedContent.version).toBe("1.0.0");
    expect(savedContent.data.users).toHaveLength(1);
    expect(savedContent.data.projects).toHaveLength(1);
  });

  it("should restore database atomically from a backup file", async () => {
    const backupData: DatabaseBackup = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      counts: { users: 1, projects: 1 },
      data: {
        users: [{ id: "u1", email: "restored@local" }],
        oauthAccounts: [],
        sessions: [],
        projects: [{ id: "p1", slug: "restored-app" }],
        projectMembers: [],
        environments: [],
        environmentVariables: [],
        deployments: [],
        deploymentLogs: [],
        releases: [],
        auditLogs: [],
        webhookDeliveries: [],
      },
    };

    const backupFile = path.join(tempDir, "restore-test.json");
    await fs.writeFile(backupFile, JSON.stringify(backupData), "utf8");

    const result = await restoreDatabaseBackup(
      mockPrisma as unknown as PrismaClient,
      backupFile,
    );

    expect(result.success).toBe(true);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.user.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.user.createMany).toHaveBeenCalledWith({
      data: [{ id: "u1", email: "restored@local" }],
    });
    expect(mockPrisma.project.createMany).toHaveBeenCalledWith({
      data: [{ id: "p1", slug: "restored-app" }],
    });
  });

  it("should throw error when backup format is corrupted or invalid", async () => {
    const corruptedFile = path.join(tempDir, "corrupted.json");
    await fs.writeFile(
      corruptedFile,
      JSON.stringify({ invalid: true }),
      "utf8",
    );

    await expect(
      restoreDatabaseBackup(
        mockPrisma as unknown as PrismaClient,
        corruptedFile,
      ),
    ).rejects.toThrow("Invalid CloudPilot database backup format");
  });
});
