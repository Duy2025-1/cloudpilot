import { Module } from "@nestjs/common";
import { GitHubController } from "./github.controller.js";
import { GitHubService } from "./github.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { DeploymentsModule } from "../deployments/deployments.module.js";

@Module({
  imports: [PrismaModule, DeploymentsModule],
  controllers: [GitHubController],
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
