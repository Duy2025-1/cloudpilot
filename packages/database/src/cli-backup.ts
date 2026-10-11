import { prisma, exportDatabaseBackup } from "./index.js";

async function main() {
  const outputPath = process.argv[2];
  console.log("[Backup] Starting CloudPilot database export...");
  const result = await exportDatabaseBackup(prisma, outputPath);
  console.log(`[Backup] Completed successfully -> ${result.filePath}`);
  console.table(result.backup.counts);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[Backup] Export failed:", err);
  process.exit(1);
});
