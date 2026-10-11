import { Module } from "@nestjs/common";
import { EnvironmentsController } from "./environments.controller.js";
import { EnvironmentsService } from "./environments.service.js";

@Module({
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
  exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
