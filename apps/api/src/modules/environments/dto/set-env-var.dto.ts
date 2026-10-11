import {
  IsString,
  IsNotEmpty,
  Matches,
  IsBoolean,
  IsOptional,
} from "class-validator";

export class SetEnvVarDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z_][A-Z0-9_]*$/, {
    message:
      "Environment variable key must be uppercase alphanumeric and underscores (e.g. DATABASE_URL, PORT)",
  })
  key!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsBoolean()
  @IsOptional()
  isSecret?: boolean;
}
