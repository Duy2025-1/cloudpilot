import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

export interface DatabaseBackup {
  version: string;
  timestamp: string;
  counts: Record<string, number>;
  data: {
    users: any[];
    oauthAccounts: any[];
    sessions: any[];
    projects: any[];
    projectMembers: any[];
    environments: any[];
    environmentVariables: any[];
    deployments: any[];
    deploymentLogs: any[];
    releases: any[];
    auditLogs: any[];
    webhookDeliveries: any[];
  };
}

/**
 * Exports all database tables to a structured JSON backup
 */
export async function exportDatabaseBackup(
  prisma: PrismaClient,
  outputPath?: string,
): Promise<{ filePath: string; backup: DatabaseBackup }> {
  const [
    users,
    oauthAccounts,
    sessions,
    projects,
    projectMembers,
    environments,
    environmentVariables,
    deployments,
    deploymentLogs,
    releases,
    auditLogs,
    webhookDeliveries,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.oAuthAccount.findMany(),
    prisma.session.findMany(),
    prisma.project.findMany(),
    prisma.projectMember.findMany(),
    prisma.environment.findMany(),
    prisma.environmentVariable.findMany(),
    prisma.deployment.findMany(),
    prisma.deploymentLog.findMany(),
    prisma.release.findMany(),
    prisma.auditLog.findMany(),
    prisma.webhookDelivery.findMany(),
  ]);

  const counts: Record<string, number> = {
    users: users.length,
    oauthAccounts: oauthAccounts.length,
    sessions: sessions.length,
    projects: projects.length,
    projectMembers: projectMembers.length,
    environments: environments.length,
    environmentVariables: environmentVariables.length,
    deployments: deployments.length,
    deploymentLogs: deploymentLogs.length,
    releases: releases.length,
    auditLogs: auditLogs.length,
    webhookDeliveries: webhookDeliveries.length,
  };

  const backup: DatabaseBackup = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    counts,
    data: {
      users,
      oauthAccounts,
      sessions,
      projects,
      projectMembers,
      environments,
      environmentVariables,
      deployments,
      deploymentLogs,
      releases,
      auditLogs,
      webhookDeliveries,
    },
  };

  const targetPath =
    outputPath ||
    path.join(process.cwd(), `backup-cloudpilot-${Date.now()}.json`);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(backup, null, 2), "utf8");

  return { filePath: targetPath, backup };
}

/**
 * Restores database from a backup file or backup data object in an atomic transaction
 */
export async function restoreDatabaseBackup(
  prisma: PrismaClient,
  backupSource: string | DatabaseBackup,
): Promise<{ success: boolean; restoredCounts: Record<string, number> }> {
  let backup: DatabaseBackup;

  if (typeof backupSource === "string") {
    const raw = await fs.readFile(backupSource, "utf8");
    backup = JSON.parse(raw);
  } else {
    backup = backupSource;
  }

  if (!backup.data || !backup.version) {
    throw new Error("Invalid CloudPilot database backup format");
  }

  // Perform restore atomically inside a transaction
  await prisma.$transaction(
    async (tx) => {
      // 1. Delete in reverse dependency order
      await tx.deploymentLog.deleteMany();
      await tx.release.deleteMany();
      await tx.deployment.deleteMany();
      await tx.environmentVariable.deleteMany();
      await tx.environment.deleteMany();
      await tx.projectMember.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.webhookDelivery.deleteMany();
      await tx.project.deleteMany();
      await tx.session.deleteMany();
      await tx.oAuthAccount.deleteMany();
      await tx.user.deleteMany();

      // 2. Insert in dependency order
      if (backup.data.users?.length) {
        await tx.user.createMany({ data: backup.data.users });
      }
      if (backup.data.oauthAccounts?.length) {
        await tx.oAuthAccount.createMany({ data: backup.data.oauthAccounts });
      }
      if (backup.data.sessions?.length) {
        await tx.session.createMany({ data: backup.data.sessions });
      }
      if (backup.data.projects?.length) {
        await tx.project.createMany({ data: backup.data.projects });
      }
      if (backup.data.projectMembers?.length) {
        await tx.projectMember.createMany({ data: backup.data.projectMembers });
      }
      if (backup.data.environments?.length) {
        await tx.environment.createMany({ data: backup.data.environments });
      }
      if (backup.data.environmentVariables?.length) {
        await tx.environmentVariable.createMany({
          data: backup.data.environmentVariables,
        });
      }
      if (backup.data.deployments?.length) {
        await tx.deployment.createMany({ data: backup.data.deployments });
      }
      if (backup.data.releases?.length) {
        await tx.release.createMany({ data: backup.data.releases });
      }
      if (backup.data.deploymentLogs?.length) {
        await tx.deploymentLog.createMany({ data: backup.data.deploymentLogs });
      }
      if (backup.data.auditLogs?.length) {
        await tx.auditLog.createMany({ data: backup.data.auditLogs });
      }
      if (backup.data.webhookDeliveries?.length) {
        await tx.webhookDelivery.createMany({
          data: backup.data.webhookDeliveries,
        });
      }
    },
    { timeout: 30000 },
  );

  return { success: true, restoredCounts: backup.counts };
}
