import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./config/env.validation.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { EnvironmentsModule } from "./modules/environments/environments.module.js";
import { DeploymentsModule } from "./modules/deployments/deployments.module.js";
import { LoggingMiddleware } from "./common/middleware/logging.middleware.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    ProjectsModule,
    EnvironmentsModule,
    DeploymentsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes("*");
  }
}
