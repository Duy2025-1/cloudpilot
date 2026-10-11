import { IsString, IsNotEmpty, IsOptional, Matches } from "class-validator";

export class TriggerDeploymentDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  environmentId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]{7,40}$/, {
    message:
      "commitSha must be a valid git commit SHA (7 to 40 hex characters)",
  })
  commitSha!: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  commitMessage?: string;
}
