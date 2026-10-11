import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import net from "net";
import http from "http";
import { WorkerLogger } from "./logger.service.js";

export interface BuildResult {
  imageTag: string;
  imageDigest?: string;
}

export interface ContainerRunResult {
  containerId: string;
  hostPort: number;
}

export class DockerService {
  constructor(private readonly logger: WorkerLogger) {}

  /**
   * Probes whether the Docker daemon is accessible
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.execCommand("docker", ["version"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Builds a Docker image with safe Dockerfile fallback template
   */
  async buildImage(
    deploymentId: string,
    contextDir: string,
    imageTag: string,
    rootDirectory?: string | null,
    port = 3000,
    timeoutMs = 600000,
  ): Promise<BuildResult> {
    const isAvailable = await this.isDockerAvailable();
    if (!isAvailable) {
      throw new Error(
        "Docker daemon is not reachable. Please start Docker Desktop or the Docker service.",
      );
    }

    const appDir = rootDirectory
      ? path.join(contextDir, rootDirectory)
      : contextDir;

    let dockerfilePath = path.join(appDir, "Dockerfile");
    let hasDockerfile = false;

    try {
      await fs.access(dockerfilePath);
      hasDockerfile = true;
      await this.logger.info(
        deploymentId,
        "BUILD",
        `Using custom repository Dockerfile at '${dockerfilePath}'`,
      );
    } catch {
      // Dockerfile does not exist, will fallback to safe template
    }

    // If no Dockerfile, check for standard Node.js project
    if (!hasDockerfile) {
      const packageJsonPath = path.join(appDir, "package.json");
      let hasPackageJson = false;
      try {
        await fs.access(packageJsonPath);
        hasPackageJson = true;
      } catch {
        // package.json does not exist
      }

      if (hasPackageJson) {
        await this.logger.info(
          deploymentId,
          "BUILD",
          "No Dockerfile found. Generating standard safe Node.js application container...",
        );

        dockerfilePath = path.join(appDir, "Dockerfile.cloudpilot");
        const defaultDockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts || npm install --omit=dev || true
COPY . .
EXPOSE ${port}
USER node
CMD ["npm", "start"]
`;
        await fs.writeFile(dockerfilePath, defaultDockerfile, "utf8");
      } else {
        throw new Error(
          "No Dockerfile or supported application manifest (package.json) found in repository.",
        );
      }
    }

    await this.logger.info(
      deploymentId,
      "BUILD",
      `Starting Docker build for image tag '${imageTag}'...`,
    );

    // Run docker build safely with shell: false
    const buildArgs = ["build", "-t", imageTag, "-f", dockerfilePath, appDir];

    await this.runProcessWithLogging(
      deploymentId,
      "BUILD",
      "docker",
      buildArgs,
      appDir,
      timeoutMs,
    );

    await this.logger.info(
      deploymentId,
      "BUILD",
      `Image successfully built: ${imageTag}`,
    );

    // Try to retrieve image digest
    let imageDigest: string | undefined;
    try {
      const { stdout } = await this.execCommand("docker", [
        "inspect",
        "--format={{index .RepoDigests 0}}",
        imageTag,
      ]);
      const digest = stdout.trim();
      if (digest && digest.includes("@sha256:")) {
        imageDigest = digest.split("@")[1];
      }
    } catch {
      // Digest may not be present for local un-pushed images
    }

    return { imageTag, imageDigest };
  }

  /**
   * Finds an available local host port within the designated range
   */
  async findAvailablePort(startPort = 3100, endPort = 3999): Promise<number> {
    for (let port = startPort; port <= endPort; port++) {
      const isAvailable = await new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () => {
          server.close(() => resolve(true));
        });
      });

      if (isAvailable) {
        return port;
      }
    }
    throw new Error(
      `No available host port found in range ${startPort}-${endPort}`,
    );
  }

  /**
   * Runs container with security constraints, resource limits, and network isolation
   */
  async runContainer(
    deploymentId: string,
    containerName: string,
    imageTag: string,
    containerPort: number,
    memoryLimitMb: number,
    cpuLimit: number,
    envVars: Record<string, string>,
  ): Promise<ContainerRunResult> {
    const isAvailable = await this.isDockerAvailable();
    if (!isAvailable) {
      throw new Error("Docker daemon is not running");
    }

    // Allocate free host port
    const hostPort = await this.findAvailablePort();

    await this.logger.info(
      deploymentId,
      "DEPLOY",
      `Allocated host port: ${hostPort} -> container port: ${containerPort}`,
    );

    // Check if a container with this name already exists and remove it
    await this.stopAndRemoveContainer(containerName);

    // Assemble safe run arguments (shell: false)
    const runArgs: string[] = [
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      `127.0.0.1:${hostPort}:${containerPort}`,
      `--memory=${Math.max(128, memoryLimitMb)}m`,
      `--cpus=${Math.max(0.1, cpuLimit)}`,
      "--security-opt",
      "no-new-privileges:true",
      "--restart",
      "unless-stopped",
    ];

    // Inject decrypted environment variables securely without exposing in logs
    for (const [key, value] of Object.entries(envVars)) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        runArgs.push("-e", `${key}=${value}`);
      }
    }

    runArgs.push(imageTag);

    await this.logger.info(
      deploymentId,
      "DEPLOY",
      `Starting container '${containerName}' with resource limits (Memory: ${memoryLimitMb}MB, CPUs: ${cpuLimit})...`,
    );

    const { stdout } = await this.execCommand("docker", runArgs);
    const containerId = stdout.trim().substring(0, 12);

    await this.logger.info(
      deploymentId,
      "DEPLOY",
      `Container started with ID: ${containerId}`,
    );

    return { containerId, hostPort };
  }

  /**
   * Performs HTTP health check with retry policy until container is responsive
   */
  async checkHealth(
    deploymentId: string,
    hostPort: number,
    timeoutMs = 45000,
    intervalMs = 2000,
  ): Promise<boolean> {
    const startTime = Date.now();
    let attempt = 1;

    await this.logger.info(
      deploymentId,
      "HEALTHCHECK",
      `Performing HTTP health check on http://127.0.0.1:${hostPort} (Timeout: ${timeoutMs / 1000}s)...`,
    );

    while (Date.now() - startTime < timeoutMs) {
      const isAlive = await new Promise<boolean>((resolve) => {
        const req = http.get(
          `http://127.0.0.1:${hostPort}/`,
          { timeout: 1500 },
          (res) => {
            // Any response code under 500 confirms the HTTP server is up and responding
            if (res.statusCode && res.statusCode < 500) {
              resolve(true);
            } else {
              resolve(false);
            }
          },
        );

        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });

      if (isAlive) {
        await this.logger.info(
          deploymentId,
          "HEALTHCHECK",
          `✅ Health check passed! Container responded on port ${hostPort} in ${Date.now() - startTime}ms (Attempt ${attempt})`,
        );
        return true;
      }

      await this.logger.info(
        deploymentId,
        "HEALTHCHECK",
        `Waiting for container to accept traffic... (Attempt ${attempt})`,
      );

      attempt++;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    await this.logger.error(
      deploymentId,
      "HEALTHCHECK",
      `❌ Health check timed out after ${timeoutMs / 1000}s. Container did not respond with healthy HTTP status.`,
    );
    return false;
  }

  /**
   * Safely stops and deletes a container by name or ID
   */
  async stopAndRemoveContainer(containerIdOrName: string): Promise<void> {
    try {
      await this.execCommand("docker", ["stop", "-t", "5", containerIdOrName]);
    } catch {
      // Ignore if already stopped
    }
    try {
      await this.execCommand("docker", ["rm", "-f", containerIdOrName]);
    } catch {
      // Ignore if not found
    }
  }

  /**
   * Executes a command and captures stdout/stderr
   */
  private execCommand(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { shell: false });
      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));

      child.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(
            new Error(
              `Command '${cmd} ${args[0]}' exited with code ${code}: ${stderr}`,
            ),
          );
      });
      child.on("error", (err) => reject(err));
    });
  }

  /**
   * Runs process and streams output line-by-line to deployment logs
   */
  private runProcessWithLogging(
    deploymentId: string,
    step: string,
    cmd: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, shell: false });
      let isTimedOut = false;

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGKILL");
        reject(
          new Error(
            `Process '${cmd} ${args[0]}' timed out after ${timeoutMs / 1000}s`,
          ),
        );
      }, timeoutMs);

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString("utf8").trim();
        if (text) {
          for (const line of text.split("\n")) {
            if (line.trim()) this.logger.info(deploymentId, step, line.trim());
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString("utf8").trim();
        if (text) {
          for (const line of text.split("\n")) {
            if (line.trim()) this.logger.info(deploymentId, step, line.trim());
          }
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (isTimedOut) return;
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `Process '${cmd} ${args[0]}' failed with exit code: ${code}`,
            ),
          );
      });
    });
  }
}
