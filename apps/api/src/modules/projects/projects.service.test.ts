import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectsService } from "./projects.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ConflictException } from "@nestjs/common";
import { ProjectRole } from "@cloudpilot/database";

describe("ProjectsService", () => {
  let service: ProjectsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      project: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;

    service = new ProjectsService(prisma);
  });

  it("should throw ConflictException if project slug already exists", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      id: "proj_1",
      slug: "existing-app",
    } as any);

    const mockUser = {
      id: "user_1",
      email: "owner@cloudpilot.local",
      name: "Owner",
      role: "DEVELOPER",
      createdAt: new Date(),
    };

    await expect(
      service.create(
        {
          name: "Existing App",
          slug: "existing-app",
          repositoryUrl: "https://github.com/org/repo.git",
        },
        mockUser,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("should create project with environments and owner membership in transaction", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: "user_1",
      name: "Owner",
    } as any);

    const mockCreatedProject = {
      id: "proj_new",
      name: "New App",
      slug: "new-app",
      environments: [
        { id: "env_prod", name: "Production", slug: "production" },
        { id: "env_staging", name: "Staging", slug: "staging" },
      ],
      members: [{ userId: "user_1", role: ProjectRole.OWNER }],
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
      const tx = {
        project: {
          create: vi.fn().mockResolvedValueOnce(mockCreatedProject),
        },
        auditLog: {
          create: vi.fn().mockResolvedValueOnce({} as any),
        },
      };
      return callback(tx as any);
    });

    const mockUser = {
      id: "user_1",
      email: "owner@cloudpilot.local",
      name: "Owner",
      role: "DEVELOPER",
      createdAt: new Date(),
    };

    const result = await service.create(
      {
        name: "New App",
        slug: "new-app",
        repositoryUrl: "https://github.com/org/repo.git",
      },
      mockUser,
    );

    expect(result.id).toBe("proj_new");
    expect(result.environments).toHaveLength(2);
  });
});
