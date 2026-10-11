import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export interface WorkerConfig {
  databaseUrl: string;
  redisUrl: string;
  workspaceDir: string;
  dockerNetwork: string;
  baseDomain: string;
  concurrency: number;
}

export const config: WorkerConfig = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/cloudpilot?schema=public",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  workspaceDir:
    process.env.DEPLOYMENT_WORKSPACE_DIR ||
    path.resolve(process.cwd(), "tmp/workspaces"),
  dockerNetwork: process.env.DOCKER_NETWORK || "cloudpilot-apps-net",
  baseDomain: process.env.APP_BASE_DOMAIN || "localhost",
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || "2", 10),
};
