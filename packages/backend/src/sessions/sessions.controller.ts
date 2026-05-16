import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request, Response } from "express";
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

  @Post(":id/messages/stream")
  async promptStream(@Req() req: Request, @Param("id") id: string, @Body() dto: PromptDto, @Res() res: Response) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders();

    let ended = false;
    const safeEnd = () => {
      if (!ended) {
        ended = true;
        try { res.end(); } catch { /* ignore */ }
      }
    };

    const writeSse = (data: unknown) => {
      if (ended) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        safeEnd();
      }
    };

    res.on("close", () => {
      ended = true;
    });

    await this.sessions.promptStreaming(req.user!.id, id, dto.message, {
      onTraceItem: (item) => writeSse({ type: "trace", item }),
      onComplete: (result) => {
        writeSse({
          type: "done",
          assistantText: result.assistantText,
          assistantTrace: result.assistantTrace,
          eventCount: result.eventCount
        });
        safeEnd();
      },
      onError: (error) => {
        writeSse({ type: "error", message: error.message });
        safeEnd();
      }
    });
  }
}
