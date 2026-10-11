import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { DeploymentsService } from "./deployments.service.js";
import { TriggerDeploymentDto } from "./dto/trigger-deployment.dto.js";

@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async trigger(@Body() dto: TriggerDeploymentDto) {
    return this.deploymentsService.trigger(dto);
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
}
