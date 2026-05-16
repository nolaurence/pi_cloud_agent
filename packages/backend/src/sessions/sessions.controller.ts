import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SessionsService } from "./sessions.service";

class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

class PromptDto {
  @IsString()
  message!: string;
}

@Controller("sessions")
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.sessions.list(req.user!.id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateSessionDto) {
    return this.sessions.create(req.user!.id, dto);
  }

  @Get(":id/messages")
  messages(@Req() req: Request, @Param("id") id: string) {
    return this.sessions.messages(req.user!.id, id);
  }

  @Post(":id/messages")
  prompt(@Req() req: Request, @Param("id") id: string, @Body() dto: PromptDto) {
    return this.sessions.prompt(req.user!.id, id, dto.message);
  }
}
