import { DeploymentStatus } from "@cloudpilot/shared";

console.log("🤖 CloudPilot Deployment Worker initialized.");
console.log(
  `Ready to process deployment jobs. Status enum check: ${DeploymentStatus.QUEUED}`,
);
