import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const headerValue = req.headers["x-request-id"];
    const correlationId =
      typeof headerValue === "string" && headerValue.trim().length > 0
        ? headerValue.trim()
        : crypto.randomUUID();

    (req as any).correlationId = correlationId;
    res.setHeader("X-Request-Id", correlationId);

    next();
  }
}
