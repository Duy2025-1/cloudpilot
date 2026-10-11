import {
  PrismaClient,
  Role,
  ProjectRole,
  ProjectStatus,
  DeploymentStatus,
  DeploymentTrigger,
  ReleaseStatus,
  LogLevel,
  AuditAction,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { encryptSecret } from "@cloudpilot/shared";

const prisma = new PrismaClient();

const MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

async function main() {
  console.log("🌱 Starting CloudPilot database seeding...");

  // 1. Seed Users
  const passwordSalt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash("Admin123!@#", passwordSalt);
  const devPasswordHash = await bcrypt.hash("Dev123!@#", passwordSalt);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@cloudpilot.local" },
    update: {},
    create: {
      email: "admin@cloudpilot.local",
      name: "System Administrator",
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const devUser = await prisma.user.upsert({
    where: { email: "dev@cloudpilot.local" },
    update: {},
    create: {
      email: "dev@cloudpilot.local",
      name: "Lead Developer",
      passwordHash: devPasswordHash,
      role: Role.DEVELOPER,
    },
  });

  console.log(`👤 Users seeded: ${adminUser.email}, ${devUser.email}`);

  // 2. Seed Sample Project
  const project = await prisma.project.upsert({
    where: { slug: "sample-web-app" },
    update: {},
    create: {
      name: "Sample Web Application",
      slug: "sample-web-app",
      description:
        "Production sample application deployed and managed via CloudPilot",
      repositoryUrl: "https://github.com/cloudpilot-demo/sample-node-app.git",
      defaultBranch: "main",
      port: 3000,
      memoryLimitMb: 512,
      cpuLimit: 0.5,
      status: ProjectStatus.RUNNING,
      ownerId: adminUser.id,
    },
  });

  console.log(`📦 Project seeded: ${project.name} (${project.slug})`);

  // 3. Project Members
  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      projectId: project.id,
      userId: adminUser.id,
      role: ProjectRole.OWNER,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: devUser.id,
      },
    },
    update: {},
    create: {
      projectId: project.id,
      userId: devUser.id,
      role: ProjectRole.DEVELOPER,
    },
  });

  // 4. Seed Environments
  const prodEnv = await prisma.environment.upsert({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: "production",
      },
    },
    update: {},
    create: {
      projectId: project.id,
      name: "Production",
      slug: "production",
      isProduction: true,
    },
  });

  const stagingEnv = await prisma.environment.upsert({
    where: {
      projectId_slug: {
        projectId: project.id,
        slug: "staging",
      },
    },
    update: {},
    create: {
      projectId: project.id,
      name: "Staging",
      slug: "staging",
      isProduction: false,
    },
  });

  console.log(`🌍 Environments seeded: ${prodEnv.slug}, ${stagingEnv.slug}`);

  // 5. Seed Encrypted Environment Variables for Production
  const sampleEnvVars = [
    { key: "NODE_ENV", value: "production", isSecret: false },
    { key: "PORT", value: "3000", isSecret: false },
    {
      key: "DATABASE_URL",
      value: "postgresql://postgres:postgres@db:5432/app",
      isSecret: true,
    },
    {
      key: "APP_SECRET_KEY",
      value: "my_production_jwt_secret_token_123",
      isSecret: true,
    },
  ];

  for (const envVar of sampleEnvVars) {
    const encrypted = encryptSecret(envVar.value, MASTER_KEY);
    await prisma.environmentVariable.upsert({
      where: {
        environmentId_key: {
          environmentId: prodEnv.id,
          key: envVar.key,
        },
      },
      update: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        isSecret: envVar.isSecret,
      },
      create: {
        environmentId: prodEnv.id,
        key: envVar.key,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        isSecret: envVar.isSecret,
      },
    });
  }

  console.log(`🔒 Encrypted environment variables seeded for ${prodEnv.name}`);

  // 6. Seed Deployment, Logs & Release
  const existingDeployment = await prisma.deployment.findFirst({
    where: { projectId: project.id, environmentId: prodEnv.id },
  });

  if (!existingDeployment) {
    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        environmentId: prodEnv.id,
        commitSha: "7f9a2b1c8e3d4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
        commitMessage: "feat: initial production launch of web service",
        branch: "main",
        status: DeploymentStatus.SUCCESS,
        trigger: DeploymentTrigger.MANUAL,
        containerId: "cloudpilot_sample_web_app_prod_1",
        containerPort: 3000,
        durationMs: 42500,
        triggeredById: adminUser.id,
        startedAt: new Date(Date.now() - 60000),
        finishedAt: new Date(),
        logs: {
          create: [
            {
              level: LogLevel.INFO,
              step: "CLONE",
              message: "Git shallow clone completed for branch main (depth=1)",
            },
            {
              level: LogLevel.INFO,
              step: "BUILD",
              message:
                "Docker image built successfully with tag sample-web-app:v1",
            },
            {
              level: LogLevel.INFO,
              step: "DEPLOY",
              message:
                "Container started with memory limit 512MB and 0.5 CPU quota",
            },
            {
              level: LogLevel.INFO,
              step: "HEALTHCHECK",
              message: "Health check passed: HTTP 200 OK received on /health",
            },
          ],
        },
      },
    });

    const release = await prisma.release.create({
      data: {
        projectId: project.id,
        environmentId: prodEnv.id,
        deploymentId: deployment.id,
        version: 1,
        status: ReleaseStatus.ACTIVE,
        imageTag: "sample-web-app:v1",
        activeContainerId: deployment.containerId,
        activePort: 3000,
      },
    });

    console.log(
      `🚀 Deployment and Release v${release.version} seeded successfully`,
    );
  }

  // 7. Audit Log
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      projectId: project.id,
      action: AuditAction.PROJECT_CREATE,
      metadata: { projectName: project.name, slug: project.slug },
      ipAddress: "127.0.0.1",
      userAgent: "CloudPilot-Seeder/1.0",
    },
  });

  console.log("✅ CloudPilot database seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
