import { prisma, restoreDatabaseBackup } from "./index.js";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: pnpm db:restore <path-to-backup.json>");
    process.exit(1);
  }

  console.log(`[Restore] Restoring CloudPilot database from '${inputPath}'...`);
  const result = await restoreDatabaseBackup(prisma, inputPath);
  console.log(
    "[Restore] Successfully restored database in atomic transaction!",
  );
  console.table(result.restoredCounts);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[Restore] Recovery failed:", err);
  process.exit(1);
});
