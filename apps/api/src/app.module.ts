import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { validateEnvironment } from "./config/env.validation.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { EnvironmentsModule } from "./modules/environments/environments.module.js";
import { DeploymentsModule } from "./modules/deployments/deployments.module.js";
import { GitHubModule } from "./modules/github/github.module.js";
import { LoggingMiddleware } from "./common/middleware/logging.middleware.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // default 100 requests per minute
      },
    ]),
    PrismaModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    EnvironmentsModule,
    DeploymentsModule,
    GitHubModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes("*");
  }
}
