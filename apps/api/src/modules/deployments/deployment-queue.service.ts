import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  DeploymentJobPayload,
  DEPLOYMENT_QUEUE_NAME,
} from "@cloudpilot/shared";

@Injectable()
export class DeploymentQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeploymentQueueService.name);
  private redisClient?: Redis;
  private queue?: Queue<DeploymentJobPayload>;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const redisUrl =
      this.config.get<string>("REDIS_URL") || "redis://localhost:6379";

    try {
      this.redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy: (times) => {
          if (times > 5) return null; // stop retrying after 5 attempts in dev if redis is down
          return Math.min(times * 1000, 5000);
        },
      });

      this.redisClient.on("error", (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}`);
      });

      this.redisClient.on("connect", () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${redisUrl}`);
      });

      this.redisClient.connect().catch((err) => {
        this.logger.warn(
          `Initial Redis connection could not be established: ${err.message}`,
        );
      });

      this.queue = new Queue<DeploymentJobPayload>(DEPLOYMENT_QUEUE_NAME, {
        connection: this.redisClient,
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to initialize BullMQ deployment queue: ${err.message}`,
      );
    }
  }

  async addJob(payload: DeploymentJobPayload): Promise<boolean> {
    if (!this.queue || !this.redisClient) {
      this.logger.warn(
        `Queue not ready. Job ${payload.deploymentId} was persisted to DB but not enqueued to Redis.`,
      );
      return false;
    }

    try {
      await this.queue.add("deploy", payload, {
        jobId: payload.deploymentId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
      this.logger.log(
        `Enqueued deployment job ${payload.deploymentId} to BullMQ queue '${DEPLOYMENT_QUEUE_NAME}'`,
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Failed to enqueue deployment job ${payload.deploymentId} to Redis: ${err.message}`,
      );
      return false;
    }
  }

  async cancelJob(deploymentId: string): Promise<boolean> {
    if (!this.queue) return false;
    try {
      const job = await this.queue.getJob(deploymentId);
      if (job) {
        await job.remove();
        this.logger.log(`Removed job ${deploymentId} from BullMQ queue`);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.warn(
        `Could not remove job ${deploymentId} from BullMQ: ${err.message}`,
      );
      return false;
    }
  }

  get isQueueReady(): boolean {
    return this.isConnected;
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close().catch(() => {});
    }
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }
}
