import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { PrismaService } from "./modules/prisma/prisma.service.js";
import { DeploymentQueueService } from "./modules/deployments/deployment-queue.service.js";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter.js";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor.js";

describe("CloudPilot API - End-to-End Test Suite", () => {
  let app: INestApplication;
  let mockPrisma: any;
  let mockQueue: any;

  beforeAll(async () => {
    mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      session: {
        create: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
      },
      projectMember: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      environment: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      environmentVariable: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn(),
      },
      deployment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
      },
      deploymentLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit_test" }),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };

    mockQueue = {
      checkHealth: vi.fn().mockResolvedValue({
        status: "connected",
        latencyMs: 1,
        counts: { active: 0, waiting: 0, completed: 2, failed: 0 },
      }),
      isQueueReady: true,
      enqueueDeployment: vi.fn().mockResolvedValue(true),
      cancelJob: vi.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(DeploymentQueueService)
      .useValue(mockQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("1. Health Checks & Metrics", () => {
    it("GET /api/v1/health should return ok with database and redis statuses", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/health");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ok");
      expect(res.body.data.services.database.status).toBe("connected");
      expect(res.body.data.services.redis.status).toBe("connected");
      expect(res.body.data.memory).toBeDefined();
    });

    it("GET /api/v1/health/detailed should return queue metrics and runtime info", async () => {
      const res = await request(app.getHttpServer()).get(
        "/api/v1/health/detailed",
      );

      expect(res.status).toBe(200);
      expect(res.body.data.queue.isReady).toBe(true);
      expect(res.body.data.runtime.nodeVersion).toBeDefined();
    });
  });

  describe("2. Correlation ID Header Propagation", () => {
    it("should echo incoming X-Request-Id header", async () => {
      const customId = "trace-test-uuid-12345";
      const res = await request(app.getHttpServer())
        .get("/api/v1/health")
        .set("X-Request-Id", customId);

      expect(res.headers["x-request-id"]).toBe(customId);
    });

    it("should auto-generate X-Request-Id header when omitted", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/health");
      expect(res.headers["x-request-id"]).toBeDefined();
      expect(res.headers["x-request-id"].length).toBeGreaterThan(10);
    });
  });

  describe("3. SSRF Protection on Project Creation", () => {
    const validToken = "a".repeat(64);

    it("should reject repositoryUrl targeting loopback address (127.0.0.1)", async () => {
      // Mock authenticated session
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        id: validToken,
        userId: "u1",
        expiresAt: new Date(Date.now() + 3600000),
        user: {
          id: "u1",
          email: "user@local",
          name: "User",
          role: "DEVELOPER",
          createdAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set("Cookie", [`cloudpilot_session=${validToken}`])
        .send({
          name: "SSRF Test",
          slug: "ssrf-test",
          repositoryUrl: "http://127.0.0.1/evil-internal.git",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("SSRF protection");
    });

    it("should reject repositoryUrl targeting cloud metadata IP (169.254.169.254)", async () => {
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        id: validToken,
        userId: "u1",
        expiresAt: new Date(Date.now() + 3600000),
        user: {
          id: "u1",
          email: "user@local",
          name: "User",
          role: "DEVELOPER",
          createdAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set("Cookie", [`cloudpilot_session=${validToken}`])
        .send({
          name: "SSRF Metadata Test",
          slug: "ssrf-meta",
          repositoryUrl: "http://169.254.169.254/latest/meta-data",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("SSRF protection");
    });
  });

  describe("4. Authentication Guard & Object-Level Access Control", () => {
    it("should reject accessing deployments without authentication cookie", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/deployments");
      expect(res.status).toBe(401);
    });

    it("should reject accessing environments without authentication cookie", async () => {
      const res = await request(app.getHttpServer()).get(
        "/api/v1/environments/env_1/vars",
      );
      expect(res.status).toBe(401);
    });
  });
});
