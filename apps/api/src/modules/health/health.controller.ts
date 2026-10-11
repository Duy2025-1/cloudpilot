import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { DeploymentQueueService } from "../deployments/deployment-queue.service.js";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: DeploymentQueueService,
  ) {}

  @Get()
  async check() {
    let databaseStatus: "connected" | "error";
    let databaseLatencyMs = -1;

    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      databaseLatencyMs = Date.now() - start;
      databaseStatus = "connected";
    } catch {
      databaseStatus = "error";
    }

    const redisHealth = await this.queueService.checkHealth();
    const isHealthy = databaseStatus === "connected";

    return {
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0),
      services: {
        database: {
          status: databaseStatus,
          latencyMs: databaseLatencyMs,
        },
        redis: {
          status: redisHealth.status,
          latencyMs: redisHealth.latencyMs,
        },
      },
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };
  }

  @Get("detailed")
  async detailed() {
    const basic = await this.check();
    const redisHealth = await this.queueService.checkHealth();

    return {
      ...basic,
      queue: {
        isReady: this.queueService.isQueueReady,
        counts: redisHealth.counts || {
          active: 0,
          waiting: 0,
          completed: 0,
          failed: 0,
        },
      },
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      },
    };
  }
}
