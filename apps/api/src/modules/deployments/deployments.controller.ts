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
import { Throttle } from "@nestjs/throttler";
import { DeploymentsService } from "./deployments.service.js";
import { TriggerDeploymentDto } from "./dto/trigger-deployment.dto.js";
import { RollbackDeploymentDto } from "./dto/rollback-deployment.dto.js";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/decorators/current-user.decorator.js";

@Controller("deployments")
@UseGuards(SessionAuthGuard)
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async trigger(
    @Body() dto: TriggerDeploymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.trigger(dto, user.id, user.role);
  }

  @Post("rollback")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async rollback(
    @Body() dto: RollbackDeploymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.rollback(dto, user.id, user.role);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.cancel(id, user.id, user.role);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query("projectId") projectId?: string,
    @Query("environmentId") environmentId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.deploymentsService.findAll(
      projectId,
      environmentId,
      user.id,
      user.role,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deploymentsService.findOne(id, user.id, user.role);
  }

  @Get(":id/logs")
  async getLogs(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
  ) {
    return this.deploymentsService.getLogs(
      id,
      user.id,
      user.role,
      limit ? parseInt(limit, 10) : 500,
    );
  }
}
