import { describe, it, expect } from "vitest";
import { DeploymentStatus, DeploymentTrigger } from "@cloudpilot/shared";

describe("Worker Deployment Definitions", () => {
  it("should verify initial deployment job contract", () => {
    const sampleJob = {
      deploymentId: "dep_123",
      projectId: "proj_abc",
      status: DeploymentStatus.QUEUED,
      trigger: DeploymentTrigger.MANUAL,
    };

    expect(sampleJob.deploymentId).toBe("dep_123");
    expect(sampleJob.status).toBe("QUEUED");
    expect(sampleJob.trigger).toBe("MANUAL");
  });

  it("should define valid deployment status transitions", () => {
    const validTransitions: Record<DeploymentStatus, DeploymentStatus[]> = {
      [DeploymentStatus.QUEUED]: [
        DeploymentStatus.CLONING,
        DeploymentStatus.CANCELLED,
      ],
      [DeploymentStatus.CLONING]: [
        DeploymentStatus.BUILDING,
        DeploymentStatus.FAILED,
      ],
      [DeploymentStatus.BUILDING]: [
        DeploymentStatus.DEPLOYING,
        DeploymentStatus.FAILED,
      ],
      [DeploymentStatus.DEPLOYING]: [
        DeploymentStatus.HEALTH_CHECKING,
        DeploymentStatus.FAILED,
      ],
      [DeploymentStatus.HEALTH_CHECKING]: [
        DeploymentStatus.SUCCESS,
        DeploymentStatus.FAILED,
      ],
      [DeploymentStatus.SUCCESS]: [DeploymentStatus.ROLLED_BACK],
      [DeploymentStatus.FAILED]: [],
      [DeploymentStatus.CANCELLED]: [],
      [DeploymentStatus.ROLLED_BACK]: [],
    };

    expect(validTransitions[DeploymentStatus.QUEUED]).toContain(
      DeploymentStatus.CLONING,
    );
    expect(validTransitions[DeploymentStatus.HEALTH_CHECKING]).toContain(
      DeploymentStatus.SUCCESS,
    );
  });
});
