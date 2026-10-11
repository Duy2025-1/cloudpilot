import { IsString, IsNotEmpty } from "class-validator";

export class RollbackDeploymentDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  environmentId!: string;

  @IsString()
  @IsNotEmpty()
  targetReleaseId!: string;
}
