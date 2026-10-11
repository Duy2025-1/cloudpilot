import { describe, it, expect, vi } from "vitest";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { DeploymentQueueService } from "../deployments/deployment-queue.service.js";

describe("HealthController", () => {
  const mockQueueService = {
    checkHealth: vi.fn().mockResolvedValue({
      status: "connected",
      latencyMs: 2,
      counts: { active: 1, waiting: 0, completed: 5, failed: 0 },
    }),
    isQueueReady: true,
  } as unknown as DeploymentQueueService;

  it("should return health status ok and database status connected when db query succeeds", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ "?column?": 1 }]),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma, mockQueueService);
    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(result.services.database.status).toBe("connected");
    expect(result.services.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.services.redis.status).toBe("connected");
    expect(result.memory).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });

  it("should return database status error when db query fails", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValueOnce(new Error("Connection lost")),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma, mockQueueService);
    const result = await controller.check();

    expect(result.status).toBe("degraded");
    expect(result.services.database.status).toBe("error");
    expect(result.services.database.latencyMs).toBe(-1);
  });

  it("should return detailed runtime and queue metrics on detailed()", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ "?column?": 1 }]),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma, mockQueueService);
    const result = await controller.detailed();

    expect(result.queue.isReady).toBe(true);
    expect(result.queue.counts.active).toBe(1);
    expect(result.runtime.nodeVersion).toBeDefined();
  });
});
