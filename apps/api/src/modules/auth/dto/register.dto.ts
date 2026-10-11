import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Must be a valid email address" })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, {
    message:
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: "Name must be at least 2 characters" })
  @MaxLength(60)
  name!: string;
}
