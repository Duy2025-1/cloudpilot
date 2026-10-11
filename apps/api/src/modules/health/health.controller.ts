import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0),
      services: {
        database: {
          status: databaseStatus,
          latencyMs: databaseLatencyMs,
        },
      },
    };
  }
}
