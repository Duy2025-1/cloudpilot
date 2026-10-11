import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { EnvironmentsService } from "./environments.service.js";
import { SetEnvVarDto } from "./dto/set-env-var.dto.js";

@Controller("environments/:environmentId/vars")
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async setVar(
    @Param("environmentId") environmentId: string,
    @Body() dto: SetEnvVarDto,
  ) {
    return this.environmentsService.setEnvVar(environmentId, dto);
  }

  @Get()
  async getVars(@Param("environmentId") environmentId: string) {
    return this.environmentsService.getEnvVars(environmentId);
  }

  @Delete(":key")
  async deleteVar(
    @Param("environmentId") environmentId: string,
    @Param("key") key: string,
  ) {
    return this.environmentsService.deleteEnvVar(environmentId, key);
  }
}
