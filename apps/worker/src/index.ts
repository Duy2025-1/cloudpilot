import { DeploymentWorker } from "./worker.js";

export * from "./worker.js";
export * from "./services/logger.service.js";
export * from "./services/git.service.js";
export * from "./services/docker.service.js";
export * from "./services/deployment-runner.service.js";

const worker = new DeploymentWorker();

// Only automatically start worker when executed directly (not when imported in unit tests)
if (process.env.NODE_ENV !== "test") {
  worker.start().catch((err) => {
    console.error("Fatal error starting deployment worker:", err);
    process.exit(1);
  });

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Gracefully stopping worker...`);
    await worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}
