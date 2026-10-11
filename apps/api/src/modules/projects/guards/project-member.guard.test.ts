import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectMemberGuard } from "./project-member.guard.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Reflector } from "@nestjs/core";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ProjectRole, Role } from "@cloudpilot/database";

describe("ProjectMemberGuard", () => {
  let guard: ProjectMemberGuard;
  let prisma: PrismaService;
  let reflector: Reflector;

  beforeEach(() => {
    prisma = {
      project: {
        findFirst: vi.fn(),
      },
      projectMember: {
        findUnique: vi.fn(),
      },
    } as unknown as PrismaService;

    reflector = {
      getAllAndOverride: vi.fn(),
    } as unknown as Reflector;

    guard = new ProjectMemberGuard(reflector, prisma);
  });

  function createMockContext(
    user: any,
    params: any = {},
    body: any = {},
  ): ExecutionContext {
    const request = { user, params, body };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it("should allow System Admin to access any project regardless of membership", async () => {
    const ctx = createMockContext(
      { id: "admin_1", role: Role.ADMIN },
      { idOrSlug: "some-project" },
    );

    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
  });

  it("should allow access if user is a member with sufficient role", async () => {
    const ctx = createMockContext(
      { id: "user_1", role: Role.DEVELOPER },
      { idOrSlug: "project-123" },
    );

    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({
      id: "proj_real_id",
      slug: "project-123",
    } as any);

    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      projectId: "proj_real_id",
      userId: "user_1",
      role: ProjectRole.OWNER,
    } as any);

    vi.mocked(reflector.getAllAndOverride).mockReturnValueOnce(
      ProjectRole.DEVELOPER,
    );

    const allowed = await guard.canActivate(ctx);
    expect(allowed).toBe(true);
  });

  it("should deny access if user is NOT a member of the project (Cross-user isolation)", async () => {
    const ctx = createMockContext(
      { id: "user_b_attacker", role: Role.DEVELOPER },
      { idOrSlug: "user-a-secret-project" },
    );

    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({
      id: "proj_a",
      slug: "user-a-secret-project",
    } as any);

    // Membership query returns null (User B is not in User A's project)
    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new ForbiddenException(
        "You do not have permission to access this project",
      ),
    );
  });

  it("should deny access if user has lower role than required operation", async () => {
    const ctx = createMockContext(
      { id: "user_viewer", role: Role.DEVELOPER },
      { idOrSlug: "project-1" },
    );

    vi.mocked(prisma.project.findFirst).mockResolvedValueOnce({
      id: "proj_1",
      slug: "project-1",
    } as any);

    vi.mocked(prisma.projectMember.findUnique).mockResolvedValueOnce({
      projectId: "proj_1",
      userId: "user_viewer",
      role: ProjectRole.VIEWER,
    } as any);

    // Endpoint requires OWNER role
    vi.mocked(reflector.getAllAndOverride).mockReturnValueOnce(
      ProjectRole.OWNER,
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /Insufficient permissions/,
    );
  });
});
