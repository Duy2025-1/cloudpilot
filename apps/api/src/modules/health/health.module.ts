import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { DeploymentsModule } from "../deployments/deployments.module.js";

@Module({
  imports: [DeploymentsModule],
  controllers: [HealthController],
})
export class HealthModule {}
