import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@cloudpilot/database";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log(
        "✅ PostgreSQL Database connection established via Prisma.",
      );
    } catch (error) {
      this.logger.error("❌ Failed to connect to PostgreSQL Database:", error);
      // We do not crash in test environments if DB is not up, but log clearly
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("Database connection disconnected.");
  }
}
