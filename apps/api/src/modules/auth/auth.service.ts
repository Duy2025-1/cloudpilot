import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "./password.service.js";
import { SessionService } from "./session.service.js";
import { RegisterDto } from "./dto/register.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { Role, AuditAction } from "@cloudpilot/database";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
  ) {}

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    // If this is the very first user in the system, grant ADMIN role; otherwise DEVELOPER
    const userCount = await this.prisma.user.count();
    const role = userCount === 0 ? Role.ADMIN : Role.DEVELOPER;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    const sessionToken = await this.sessionService.createSession(
      user.id,
      ipAddress,
      userAgent,
    );

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.USER_REGISTER,
        metadata: { email: user.email, role: user.role },
        ipAddress,
        userAgent,
      },
    });

    this.logger.log(`New user registered: ${user.email} (${user.role})`);

    return { user, sessionToken };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isMatch = await this.passwordService.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isMatch) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const sessionToken = await this.sessionService.createSession(
      user.id,
      ipAddress,
      userAgent,
    );

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: AuditAction.USER_LOGIN,
        metadata: { email: user.email },
        ipAddress,
        userAgent,
      },
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      sessionToken,
    };
  }

  async logout(sessionToken?: string, userId?: string) {
    if (sessionToken) {
      await this.sessionService.revokeSession(sessionToken);
    }

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: AuditAction.USER_LOGOUT,
          metadata: {},
        },
      });
    }

    return { message: "Logged out successfully" };
  }

  async getMe(sessionToken: string) {
    const user = await this.sessionService.validateSession(sessionToken);
    if (!user) {
      throw new UnauthorizedException(
        "Authentication required or session expired",
      );
    }
    return user;
  }
}
