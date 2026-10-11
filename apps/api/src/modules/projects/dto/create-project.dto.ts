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
  @Matches(/^(https?:\/\/|git@).+\.git$/, {
    message:
      "Repository URL must be a valid HTTP(S) or SSH Git URL ending with .git",
  })
  repositoryUrl!: string;

  @IsString()
  @IsOptional()
  defaultBranch?: string;

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
