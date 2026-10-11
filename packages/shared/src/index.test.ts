import { describe, it, expect } from "vitest";
import {
  UserRole,
  ProjectStatus,
  DeploymentStatus,
  DeploymentTrigger,
  LogLevel,
  AuditAction,
} from "./index.js";

describe("Shared Enums", () => {
  it("should have correct UserRole values", () => {
    expect(UserRole.ADMIN).toBe("ADMIN");
    expect(UserRole.DEVELOPER).toBe("DEVELOPER");
    expect(UserRole.VIEWER).toBe("VIEWER");
  });

  it("should define lifecycle DeploymentStatus values", () => {
    expect(DeploymentStatus.QUEUED).toBe("QUEUED");
    expect(DeploymentStatus.BUILDING).toBe("BUILDING");
    expect(DeploymentStatus.DEPLOYING).toBe("DEPLOYING");
    expect(DeploymentStatus.SUCCESS).toBe("SUCCESS");
    expect(DeploymentStatus.FAILED).toBe("FAILED");
    expect(DeploymentStatus.ROLLED_BACK).toBe("ROLLED_BACK");
  });

  it("should define ProjectStatus values", () => {
    expect(ProjectStatus.IDLE).toBe("IDLE");
    expect(ProjectStatus.RUNNING).toBe("RUNNING");
    expect(ProjectStatus.STOPPED).toBe("STOPPED");
  });

  it("should define AuditAction, LogLevel and DeploymentTrigger values", () => {
    expect(LogLevel.INFO).toBe("INFO");
    expect(LogLevel.ERROR).toBe("ERROR");
    expect(DeploymentTrigger.MANUAL).toBe("MANUAL");
    expect(AuditAction.PROJECT_CREATE).toBe("PROJECT_CREATE");
    expect(AuditAction.DEPLOYMENT_TRIGGER).toBe("DEPLOYMENT_TRIGGER");
  });
});
