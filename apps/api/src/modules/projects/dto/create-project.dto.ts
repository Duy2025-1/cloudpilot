import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from "class-validator";

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      "Slug must contain only lowercase letters, numbers, and single hyphens (e.g. my-app-1)",
  })
  slug!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(https?:\/\/|git@)[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+$/, {
    message: "Repository URL must be a valid HTTP(S) or SSH Git URL",
  })
  repositoryUrl!: string;

  @IsString()
  @IsOptional()
  repositoryId?: string;

  @IsString()
  @IsOptional()
  repositoryFullName?: string;

  @IsString()
  @IsOptional()
  repositoryOwner?: string;

  @IsString()
  @IsOptional()
  defaultBranch?: string;

  @IsString()
  @IsOptional()
  autoDeployBranch?: string;

  @IsBoolean()
  @IsOptional()
  autoDeployEnabled?: boolean;

  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsString()
  @IsOptional()
  rootDirectory?: string;

  @IsString()
  @IsOptional()
  buildCommand?: string;

  @IsString()
  @IsOptional()
  startCommand?: string;
}
