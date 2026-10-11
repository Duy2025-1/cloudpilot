import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { DeploymentsService } from "./deployments.service.js";
import { TriggerDeploymentDto } from "./dto/trigger-deployment.dto.js";
import { RollbackDeploymentDto } from "./dto/rollback-deployment.dto.js";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/decorators/current-user.decorator.js";

@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async trigger(
    @Body() dto: TriggerDeploymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.trigger(dto, user.id);
  }

  @Post("rollback")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async rollback(
    @Body() dto: RollbackDeploymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.rollback(dto, user.id);
  }

  @Post(":id/cancel")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.cancel(id, user.id);
  }

  @Get()
  async findAll(
    @Query("projectId") projectId?: string,
    @Query("environmentId") environmentId?: string,
  ) {
    return this.deploymentsService.findAll(projectId, environmentId);
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.deploymentsService.findOne(id);
  }

  @Get(":id/logs")
  async getLogs(@Param("id") id: string) {
    return this.deploymentsService.getLogs(id);
  }
}
