export interface EnvironmentVariables {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  ENCRYPTION_MASTER_KEY: string;
  JWT_SECRET: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;
  GITHUB_WEBHOOK_SECRET?: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const errors: string[] = [];

  const nodeEnv = (config.NODE_ENV as string) || "development";
  if (!["development", "production", "test"].includes(nodeEnv)) {
    errors.push("NODE_ENV must be one of: development, production, test");
  }

  const port = Number(config.API_PORT || config.PORT || 4000);
  if (isNaN(port) || port <= 0 || port > 65535) {
    errors.push("PORT must be a valid port number between 1 and 65535");
  }

  const databaseUrl = config.DATABASE_URL as string;
  if (
    !databaseUrl ||
    typeof databaseUrl !== "string" ||
    !databaseUrl.startsWith("postgresql://")
  ) {
    errors.push(
      "DATABASE_URL is required and must be a valid PostgreSQL connection string",
    );
  }

  const encryptionKey = config.ENCRYPTION_MASTER_KEY as string;
  if (
    !encryptionKey ||
    encryptionKey.length !== 64 ||
    !/^[0-9a-fA-F]+$/.test(encryptionKey)
  ) {
    errors.push(
      "ENCRYPTION_MASTER_KEY is required and must be a 64-character hexadecimal string (32 bytes for AES-256)",
    );
  }

  const jwtSecret = config.JWT_SECRET as string;
  if (!jwtSecret || typeof jwtSecret !== "string" || jwtSecret.length < 8) {
    errors.push(
      "JWT_SECRET is required and must be at least 8 characters long",
    );
  }

  const redisUrl = (config.REDIS_URL as string) || "redis://localhost:6379";

  if (errors.length > 0) {
    throw new Error(
      `\n❌ Application configuration validation failed:\n  - ${errors.join("\n  - ")}\n`,
    );
  }

  return {
    NODE_ENV: nodeEnv as "development" | "production" | "test",
    PORT: port,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    ENCRYPTION_MASTER_KEY: encryptionKey,
    JWT_SECRET: jwtSecret,
    GITHUB_CLIENT_ID: config.GITHUB_CLIENT_ID as string | undefined,
    GITHUB_CLIENT_SECRET: config.GITHUB_CLIENT_SECRET as string | undefined,
    GITHUB_REDIRECT_URI:
      (config.GITHUB_REDIRECT_URI as string) ||
      `http://localhost:${port}/api/v1/github/callback`,
    GITHUB_WEBHOOK_SECRET:
      (config.GITHUB_WEBHOOK_SECRET as string) ||
      "cloudpilot_dev_webhook_secret_key_12345",
  };
}
