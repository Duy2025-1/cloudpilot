import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectMemberGuard } from "./guards/project-member.guard.js";

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMemberGuard],
  exports: [ProjectsService, ProjectMemberGuard],
})
export class ProjectsModule {}
