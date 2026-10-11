import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  Req,
  Res,
  Headers,
  Body,
  Ip,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { RawBodyRequest } from "@nestjs/common";
import { GitHubService } from "./github.service.js";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/decorators/current-user.decorator.js";

@Controller("github")
export class GitHubController {
  constructor(private readonly githubService: GitHubService) {}

  /**
   * Get GitHub OAuth connection URL with secure state
   */
  @Get("connect")
  @UseGuards(SessionAuthGuard)
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.githubService.getAuthorizationUrl(user.id);
  }

  /**
   * GitHub OAuth Callback URL
   */
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.githubService.handleOAuthCallback(
      code,
      state,
      user?.id,
      ipAddress,
      userAgent,
    );

    // If browser navigation, redirect back to frontend
    const acceptHeader = req.headers.accept || "";
    if (acceptHeader.includes("text/html")) {
      const redirectUrl =
        process.env.WEB_BASE_URL ||
        "http://localhost:3000/projects/new?github=connected";
      return res.redirect(redirectUrl);
    }

    return res.status(HttpStatus.OK).json({
      success: true,
      message: "GitHub account connected successfully",
      data: result,
    });
  }

  /**
   * Check connection status of current user
   */
  @Get("status")
  @UseGuards(SessionAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.githubService.getConnectionStatus(user.id);
  }

  /**
   * Disconnect GitHub account
   */
  @Post("disconnect")
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    return this.githubService.disconnect(user.id, ipAddress, userAgent);
  }

  /**
   * List accessible repositories for connected user
   */
  @Get("repositories")
  @UseGuards(SessionAuthGuard)
  getRepositories(@CurrentUser() user: AuthenticatedUser) {
    return this.githubService.getRepositories(user.id);
  }

  /**
   * List branches for a specific repository
   */
  @Get("repositories/:owner/:repo/branches")
  @UseGuards(SessionAuthGuard)
  getBranches(
    @CurrentUser() user: AuthenticatedUser,
    @Param("owner") owner: string,
    @Param("repo") repo: string,
  ) {
    return this.githubService.getBranches(user.id, owner, repo);
  }

  /**
   * List recent commits for a repository and branch
   */
  @Get("repositories/:owner/:repo/commits")
  @UseGuards(SessionAuthGuard)
  getCommits(
    @CurrentUser() user: AuthenticatedUser,
    @Param("owner") owner: string,
    @Param("repo") repo: string,
    @Query("branch") branch?: string,
  ) {
    return this.githubService.getCommits(user.id, owner, repo, branch);
  }

  /**
   * GitHub Webhook Receiver
   * Verifies signature, prevents duplicate delivery, and triggers auto-deployment
   */
  @Post("webhooks")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
  ) {
    const rawBody =
      req.rawBody || Buffer.from(JSON.stringify(body || {}), "utf8");
    return this.githubService.handleWebhook(headers, rawBody, body);
  }
}
