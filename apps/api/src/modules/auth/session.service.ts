import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { randomBytes } from "crypto";
import { CookieOptions } from "express";

export const SESSION_COOKIE_NAME = "cloudpilot_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getSessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS,
  };
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await this.prisma.session.create({
      data: {
        id: sessionToken,
        userId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return sessionToken;
  }

  async validateSession(sessionToken: string) {
    if (!sessionToken || sessionToken.length !== 64) {
      return null;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Check expiration
    if (new Date() > session.expiresAt) {
      this.logger.warn(
        `Session ${sessionToken.substring(0, 8)}... has expired. Removing.`,
      );
      await this.prisma.session
        .delete({ where: { id: sessionToken } })
        .catch(() => {});
      return null;
    }

    return session.user;
  }

  async revokeSession(sessionToken: string): Promise<boolean> {
    try {
      await this.prisma.session.delete({
        where: { id: sessionToken },
      });
      return true;
    } catch {
      return false;
    }
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
