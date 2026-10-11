import { DeploymentTrigger, LogLevel } from "./enums.js";

export const DEPLOYMENT_QUEUE_NAME = "cloudpilot-deployments";

export interface DeploymentJobPayload {
  deploymentId: string;
  projectId: string;
  projectName: string;
  projectSlug?: string;
  environmentId: string;
  environmentName: string;
  environmentSlug?: string;
  repositoryUrl: string;
  commitSha: string;
  branch: string;
  rootDirectory?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
  port: number;
  memoryLimitMb: number;
  cpuLimit: number;
  envVars: Record<string, string>;
  trigger: DeploymentTrigger | string;
  triggeredById?: string | null;
  isRollback?: boolean;
  rollbackFromReleaseId?: string;
  imageTag?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  error?: string;
}

export interface DeploymentLogEntry {
  deploymentId: string;
  level: LogLevel;
  step: string;
  message: string;
  timestamp: string;
}

export interface DecryptedEnvVar {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface EncryptedData {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
