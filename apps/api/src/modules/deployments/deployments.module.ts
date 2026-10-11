import { Module } from "@nestjs/common";
import { DeploymentsController } from "./deployments.controller.js";
import { DeploymentsService } from "./deployments.service.js";
import { DeploymentQueueService } from "./deployment-queue.service.js";

@Module({
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentQueueService],
  exports: [DeploymentsService, DeploymentQueueService],
})
export class DeploymentsModule {}
