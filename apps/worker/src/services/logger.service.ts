import { PrismaClient, LogLevel } from "@cloudpilot/database";

export class WorkerLogger {
  constructor(private readonly prisma: PrismaClient) {}

  async log(
    deploymentId: string,
    step: string,
    message: string,
    level: LogLevel = LogLevel.INFO,
  ) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${step}] [${level}]`;

    if (level === LogLevel.ERROR) {
      console.error(`${prefix} ${message}`);
    } else if (level === LogLevel.WARN) {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    try {
      await this.prisma.deploymentLog.create({
        data: {
          deploymentId,
          step,
          level,
          message,
        },
      });
    } catch (err: any) {
      console.error(
        `Failed to persist deployment log to database: ${err.message}`,
      );
    }
  }

  async info(deploymentId: string, step: string, message: string) {
    return this.log(deploymentId, step, message, LogLevel.INFO);
  }

  async warn(deploymentId: string, step: string, message: string) {
    return this.log(deploymentId, step, message, LogLevel.WARN);
  }

  async error(deploymentId: string, step: string, message: string) {
    return this.log(deploymentId, step, message, LogLevel.ERROR);
  }
}
