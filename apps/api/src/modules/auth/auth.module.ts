import { Module, Global } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { SessionService } from "./session.service.js";
import { SessionAuthGuard } from "./guards/session-auth.guard.js";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, SessionAuthGuard],
  exports: [AuthService, PasswordService, SessionService, SessionAuthGuard],
})
export class AuthModule {}
