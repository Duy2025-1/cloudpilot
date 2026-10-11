import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { EnvironmentsService } from "./environments.service.js";
import { SetEnvVarDto } from "./dto/set-env-var.dto.js";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/decorators/current-user.decorator.js";

@Controller("environments/:environmentId/vars")
@UseGuards(SessionAuthGuard)
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async setVar(
    @Param("environmentId") environmentId: string,
    @Body() dto: SetEnvVarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.environmentsService.setEnvVar(
      environmentId,
      dto,
      user.id,
      user.role,
    );
  }

  @Get()
  async getVars(
    @Param("environmentId") environmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.environmentsService.getEnvVars(
      environmentId,
      user.id,
      user.role,
    );
  }

  @Delete(":key")
  async deleteVar(
    @Param("environmentId") environmentId: string,
    @Param("key") key: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.environmentsService.deleteEnvVar(
      environmentId,
      key,
      user.id,
      user.role,
    );
  }

  @Post(":key/reveal")
  @HttpCode(HttpStatus.OK)
  async revealVar(
    @Param("environmentId") environmentId: string,
    @Param("key") key: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.environmentsService.revealEnvVar(
      environmentId,
      key,
      user.id,
      user.role,
    );
  }
}
