import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { SessionService, SESSION_COOKIE_NAME } from "../session.service.js";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Check HttpOnly cookie
    let sessionToken = request.cookies?.[SESSION_COOKIE_NAME];

    // 2. Fallback to Authorization: Bearer header (for API clients / tests)
    if (!sessionToken && request.headers.authorization) {
      const authHeader = request.headers.authorization as string;
      if (authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.substring(7);
      }
    }

    if (!sessionToken) {
      throw new UnauthorizedException(
        "Authentication required: No session cookie or token provided",
      );
    }

    const user = await this.sessionService.validateSession(sessionToken);
    if (!user) {
      throw new UnauthorizedException(
        "Authentication required or session expired",
      );
    }

    request.user = user;
    request.sessionToken = sessionToken;

    return true;
  }
}
