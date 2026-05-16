import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BrowserConnectionsService } from "./browser-connections.service";

class ConnectExtensionDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  cdpEndpoint?: string;
}

@Controller("browser-connections")
@UseGuards(JwtAuthGuard)
export class BrowserConnectionsController {
  constructor(private readonly connections: BrowserConnectionsService) {}

  @Get("status")
  status(@Req() req: Request) {
    return this.connections.status(req.user!.id);
  }

  @Post("extension")
  connectExtension(@Req() req: Request, @Body() dto: ConnectExtensionDto) {
    return this.connections.connectExtension(req.user!.id, dto);
  }

  @Post("sandbox-cdp")
  useSandboxCdp(@Req() req: Request) {
    return this.connections.useSandboxCdp(req.user!.id);
  }
}
