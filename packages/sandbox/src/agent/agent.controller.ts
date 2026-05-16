import { Body, Controller, Param, Post, Req, Res } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request, Response } from "express";
import { PiRpcService } from "./pi-rpc.service";

class CreatePiSessionDto {
  @IsString()
  userId!: string;

  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

class PromptDto {
  @IsString()
  userId!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;
}

@Controller("agent")
export class AgentController {
  constructor(private readonly pi: PiRpcService) {}

  @Post("sessions")
  create(@Body() dto: CreatePiSessionDto) {
    return this.pi.createSession(dto);
  }

  @Post("sessions/:sessionId/prompt")
  prompt(@Param("sessionId") sessionId: string, @Body() dto: PromptDto) {
    return this.pi.prompt({
      sessionId,
      userId: dto.userId,
      message: dto.message,
      provider: dto.provider,
      model: dto.model
    });
  }

  @Post("sessions/:sessionId/prompt/stream")
  async promptStream(@Param("sessionId") sessionId: string, @Body() dto: PromptDto, @Res() res: Response) {
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

    const writeEvent = (data: unknown) => {
      if (ended) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        safeEnd();
      }
    };

    // Handle client disconnect
    res.on("close", () => {
      ended = true;
    });

    try {
      await this.pi.promptStreaming(
        { sessionId, userId: dto.userId, message: dto.message, provider: dto.provider, model: dto.model },
        {
          onEvent: (event) => writeEvent({ type: "event", event }),
          onComplete: (result) => {
            writeEvent({ type: "done", assistantText: result.assistantText, eventCount: result.events.length });
            safeEnd();
          },
          onError: (error) => {
            writeEvent({ type: "error", message: error.message });
            safeEnd();
          }
        }
      );
    } catch (error) {
      writeEvent({ type: "error", message: error instanceof Error ? error.message : String(error) });
      safeEnd();
    }
  }
}
