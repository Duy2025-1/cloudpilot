import { describe, it, expect, vi } from "vitest";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "../prisma/prisma.service.js";

describe("HealthController", () => {
  it("should return health status ok and database status connected when db query succeeds", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ "?column?": 1 }]),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma);
    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(result.services.database.status).toBe("connected");
    expect(result.services.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
  });

  it("should return database status error when db query fails", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValueOnce(new Error("Connection lost")),
    } as unknown as PrismaService;

    const controller = new HealthController(prisma);
    const result = await controller.check();

    expect(result.status).toBe("ok");
    expect(result.services.database.status).toBe("error");
    expect(result.services.database.latencyMs).toBe(-1);
  });
});
