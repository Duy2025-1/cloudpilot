import { spawn } from "child_process";
import fs from "fs/promises";
import { WorkerLogger } from "./logger.service.js";

export class GitService {
  constructor(private readonly logger: WorkerLogger) {}

  /**
   * Clones a repository and checks out the specific, immutable commit SHA safely
   */
  async cloneAndCheckout(
    deploymentId: string,
    repositoryUrl: string,
    commitSha: string,
    targetDir: string,
    timeoutMs = 120000,
  ): Promise<void> {
    // 1. Sanitize inputs
    if (!/^[0-9a-fA-F]{7,40}$/.test(commitSha)) {
      throw new Error(`Invalid Git commit SHA format: '${commitSha}'`);
    }

    if (
      !/^(https?:\/\/|git@)[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+$/.test(
        repositoryUrl,
      )
    ) {
      throw new Error(
        `Invalid or unsafe Git repository URL: '${repositoryUrl}'`,
      );
    }

    // 2. Prepare clean directory
    await fs.mkdir(targetDir, { recursive: true });

    await this.logger.info(
      deploymentId,
      "CLONE",
      `Cloning repository from '${repositoryUrl}' into isolated workspace...`,
    );

    // 3. Execute git clone
    await this.runCommand(
      deploymentId,
      "CLONE",
      "git",
      ["clone", "--no-checkout", repositoryUrl, targetDir],
      process.cwd(),
      timeoutMs,
    );

    await this.logger.info(
      deploymentId,
      "CLONE",
      `Checking out commit '${commitSha}'...`,
    );

    // 4. Execute git checkout commitSha
    await this.runCommand(
      deploymentId,
      "CLONE",
      "git",
      ["checkout", commitSha],
      targetDir,
      30000,
    );

    await this.logger.info(
      deploymentId,
      "CLONE",
      `Successfully checked out commit '${commitSha}'`,
    );
  }

  /**
   * Safely deletes the workspace directory
   */
  async cleanupWorkspace(workspaceDir: string): Promise<void> {
    try {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } catch (err: any) {
      console.warn(
        `Failed to clean workspace directory '${workspaceDir}': ${err.message}`,
      );
    }
  }

  /**
   * Executes a system command with shell: false to eliminate shell injection vulnerabilities
   */
  private runCommand(
    deploymentId: string,
    step: string,
    cmd: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let isTimedOut = false;
      const child = spawn(cmd, args, {
        cwd,
        shell: false,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0", // Prevent git from hanging waiting for interactive auth
        },
      });

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGKILL");
        reject(
          new Error(
            `Git command '${cmd} ${args[0]}' timed out after ${timeoutMs / 1000} seconds`,
          ),
        );
      }, timeoutMs);

      child.stdout.on("data", (data: Buffer) => {
        const text = data.toString("utf8").trim();
        if (text) {
          this.logger.info(deploymentId, step, text);
        }
      });

      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString("utf8").trim();
        if (text) {
          // Git outputs normal progress info to stderr; log as info unless command errors
          this.logger.info(deploymentId, step, text);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to execute '${cmd}': ${err.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Command '${cmd} ${args.join(" ")}' exited with non-zero code: ${code}`,
            ),
          );
        }
      });
    });
  }
}
