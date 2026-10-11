import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { ProjectsService } from "./projects.service.js";
import { CreateProjectDto } from "./dto/create-project.dto.js";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard.js";
import { ProjectMemberGuard } from "./guards/project-member.guard.js";
import { RequireProjectRole } from "./decorators/require-project-role.decorator.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/decorators/current-user.decorator.js";
import { ProjectRole } from "@cloudpilot/database";

@Controller("projects")
@UseGuards(SessionAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createProjectDto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.projectsService.create(
      createProjectDto,
      user,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(user);
  }

  @Get(":idOrSlug")
  @UseGuards(ProjectMemberGuard)
  async findOne(@Param("idOrSlug") idOrSlug: string) {
    return this.projectsService.findOne(idOrSlug);
  }

  @Delete(":idOrSlug")
  @UseGuards(ProjectMemberGuard)
  @RequireProjectRole(ProjectRole.OWNER)
  async delete(
    @Param("idOrSlug") idOrSlug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.delete(idOrSlug, user);
  }
}
