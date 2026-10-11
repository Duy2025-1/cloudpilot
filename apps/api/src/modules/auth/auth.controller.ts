import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service.js";
import { RegisterDto } from "./dto/register.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { SessionAuthGuard } from "./guards/session-auth.guard.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "./decorators/current-user.decorator.js";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
} from "./session.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"];
    const isProduction = process.env.NODE_ENV === "production";

    const { user, sessionToken } = await this.authService.register(
      dto,
      ipAddress,
      userAgent,
    );

    res.cookie(
      SESSION_COOKIE_NAME,
      sessionToken,
      getSessionCookieOptions(isProduction),
    );

    return { user };
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"];
    const isProduction = process.env.NODE_ENV === "production";

    const { user, sessionToken } = await this.authService.login(
      dto,
      ipAddress,
      userAgent,
    );

    res.cookie(
      SESSION_COOKIE_NAME,
      sessionToken,
      getSessionCookieOptions(isProduction),
    );

    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    await this.authService.logout(sessionToken);

    res.clearCookie(SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    });

    return { message: "Logged out successfully" };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
