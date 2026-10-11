import { Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@cloudpilot/database";
import {
  DeploymentJobPayload,
  DEPLOYMENT_QUEUE_NAME,
} from "@cloudpilot/shared";
import { WorkerLogger } from "./services/logger.service.js";
import { GitService } from "./services/git.service.js";
import { DockerService } from "./services/docker.service.js";
import { DeploymentRunnerService } from "./services/deployment-runner.service.js";
import { config } from "./config.js";

export class DeploymentWorker {
  private prisma: PrismaClient;
  private logger: WorkerLogger;
  private git: GitService;
  private docker: DockerService;
  private runner: DeploymentRunnerService;
  private worker?: Worker<DeploymentJobPayload>;
  private redisConnection?: Redis;
  private runningEnvironmentLocks = new Set<string>();

  constructor() {
    this.prisma = new PrismaClient();
    this.logger = new WorkerLogger(this.prisma);
    this.git = new GitService(this.logger);
    this.docker = new DockerService(this.logger);
    this.runner = new DeploymentRunnerService(
      this.prisma,
      this.logger,
      this.git,
      this.docker,
    );
  }

  async start(): Promise<void> {
    console.log("🚀 Starting CloudPilot Deployment Worker...");

    this.redisConnection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 5) return null;
        return Math.min(times * 1000, 5000);
      },
    });

    this.redisConnection.on("error", (err) => {
      console.warn(`[Worker] Redis connection warning: ${err.message}`);
    });

    try {
      await this.redisConnection.connect();
      console.log(`[Worker] Connected to Redis at ${config.redisUrl}`);
    } catch (err: any) {
      console.warn(
        `[Worker] Redis not immediately reachable (${err.message}). Worker will retry when available.`,
      );
    }

    this.worker = new Worker<DeploymentJobPayload>(
      DEPLOYMENT_QUEUE_NAME,
      async (job: Job<DeploymentJobPayload>) => {
        const payload = job.data;
        const envLockKey = payload.environmentId;

        // Idempotency: Prevent concurrent deployment collisions on the same environment
        while (this.runningEnvironmentLocks.has(envLockKey)) {
          console.log(
            `[Worker] Environment ${envLockKey} is currently busy. Delaying job ${job.id}...`,
          );
          await new Promise((r) => setTimeout(r, 2000));
        }

        this.runningEnvironmentLocks.add(envLockKey);

        try {
          console.log(
            `[Worker] Processing deployment job ${job.id} for project '${payload.projectName}' (Commit: ${payload.commitSha.substring(0, 7)})`,
          );
          await this.runner.runDeployment(payload);
          return { success: true, deploymentId: payload.deploymentId };
        } finally {
          this.runningEnvironmentLocks.delete(envLockKey);
        }
      },
      {
        connection: this.redisConnection,
        concurrency: config.concurrency,
      },
    );

    this.worker.on("completed", (job) => {
      console.log(`[Worker] Job ${job?.id} completed successfully.`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(
        `[Worker] Job ${job?.id} failed with error: ${err.message}`,
      );
    });

    console.log(
      `[Worker] Deployment Worker initialized and listening on queue '${DEPLOYMENT_QUEUE_NAME}' (Concurrency: ${config.concurrency})`,
    );
  }

  async stop(): Promise<void> {
    console.log("[Worker] Shutting down Deployment Worker...");
    if (this.worker) {
      await this.worker.close();
    }
    if (this.redisConnection) {
      await this.redisConnection.quit().catch(() => {});
    }
    await this.prisma.$disconnect();
    console.log("[Worker] Deployment Worker shutdown complete.");
  }
}
