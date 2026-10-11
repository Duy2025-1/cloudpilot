import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { SessionService } from "./session.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Role } from "@cloudpilot/database";

describe("AuthService", () => {
  let authService: AuthService;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let sessionService: SessionService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    } as unknown as PrismaService;

    passwordService = {
      hash: vi.fn().mockResolvedValue("argon2id$hashedpassword"),
      verify: vi.fn(),
    } as unknown as PasswordService;

    sessionService = {
      createSession: vi.fn().mockResolvedValue("test_session_token_12345"),
      validateSession: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(true),
    } as unknown as SessionService;

    authService = new AuthService(prisma, passwordService, sessionService);
  });

  it("should register a new user with Argon2id hash and create session", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(0); // First user becomes ADMIN
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "usr_1",
      email: "admin@cloudpilot.local",
      name: "Admin",
      role: Role.ADMIN,
      avatarUrl: null,
      createdAt: new Date(),
    } as any);

    const result = await authService.register({
      email: "admin@cloudpilot.local",
      password: "StrongPassword123!",
      name: "Admin",
    });

    expect(result.user.id).toBe("usr_1");
    expect(result.user.role).toBe(Role.ADMIN);
    expect(result.sessionToken).toBe("test_session_token_12345");
    expect(passwordService.hash).toHaveBeenCalledWith("StrongPassword123!");
  });

  it("should throw ConflictException if email is already taken", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "usr_existing",
    } as any);

    await expect(
      authService.register({
        email: "admin@cloudpilot.local",
        password: "StrongPassword123!",
        name: "Admin",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("should login successfully with valid credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "usr_1",
      email: "user@cloudpilot.local",
      passwordHash: "argon2id$hashed",
      name: "Dev User",
      role: Role.DEVELOPER,
      createdAt: new Date(),
    } as any);
    vi.mocked(passwordService.verify).mockResolvedValueOnce(true);

    const result = await authService.login({
      email: "user@cloudpilot.local",
      password: "CorrectPassword123!",
    });

    expect(result.user.id).toBe("usr_1");
    expect(result.sessionToken).toBe("test_session_token_12345");
    expect(passwordService.verify).toHaveBeenCalledWith(
      "argon2id$hashed",
      "CorrectPassword123!",
    );
  });

  it("should throw UnauthorizedException on invalid password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "usr_1",
      email: "user@cloudpilot.local",
      passwordHash: "argon2id$hashed",
    } as any);
    vi.mocked(passwordService.verify).mockResolvedValueOnce(false);

    await expect(
      authService.login({
        email: "user@cloudpilot.local",
        password: "WrongPassword!",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("should throw UnauthorizedException if user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    await expect(
      authService.login({
        email: "nonexistent@cloudpilot.local",
        password: "Password123!",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("should logout and revoke session", async () => {
    const result = await authService.logout(
      "test_session_token_12345",
      "usr_1",
    );
    expect(sessionService.revokeSession).toHaveBeenCalledWith(
      "test_session_token_12345",
    );
    expect(result.message).toBe("Logged out successfully");
  });
});
