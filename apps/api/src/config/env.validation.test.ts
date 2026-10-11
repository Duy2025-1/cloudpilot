import { describe, it, expect } from "vitest";
import { validateEnvironment } from "./env.validation.js";

describe("Environment Validation", () => {
  const validConfig = {
    NODE_ENV: "development",
    PORT: 4000,
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/cloudpilot",
    REDIS_URL: "redis://localhost:6379",
    ENCRYPTION_MASTER_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    JWT_SECRET: "super-secret-key-12345",
  };

  it("should validate and parse valid environment configuration successfully", () => {
    const validated = validateEnvironment(validConfig);
    expect(validated.PORT).toBe(4000);
    expect(validated.NODE_ENV).toBe("development");
    expect(validated.DATABASE_URL).toBe(validConfig.DATABASE_URL);
  });

  it("should throw when DATABASE_URL is missing or not postgresql", () => {
    const invalid = { ...validConfig, DATABASE_URL: "mysql://root@localhost" };
    expect(() => validateEnvironment(invalid)).toThrow(
      "DATABASE_URL is required and must be a valid PostgreSQL connection string",
    );
  });

  it("should throw when ENCRYPTION_MASTER_KEY is not 64 hex characters", () => {
    const invalid = { ...validConfig, ENCRYPTION_MASTER_KEY: "too-short-key" };
    expect(() => validateEnvironment(invalid)).toThrow(
      "ENCRYPTION_MASTER_KEY is required and must be a 64-character hexadecimal string",
    );
  });

  it("should throw when JWT_SECRET is too short", () => {
    const invalid = { ...validConfig, JWT_SECRET: "abc" };
    expect(() => validateEnvironment(invalid)).toThrow(
      "JWT_SECRET is required and must be at least 8 characters long",
    );
  });
});
