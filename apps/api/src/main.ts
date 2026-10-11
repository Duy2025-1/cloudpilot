import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter.js";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor.js";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // 1. Cookie Parser
  app.use(cookieParser());

  // 2. API Prefix
  app.setGlobalPrefix("api/v1");

  // 2. Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 3. Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // 4. Global Response Transform Interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  // 5. CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.API_PORT || process.env.PORT || 4000;
  await app.listen(port);
  logger.log(
    `🚀 CloudPilot API server is running on: http://localhost:${port}/api/v1`,
  );
}

bootstrap();
