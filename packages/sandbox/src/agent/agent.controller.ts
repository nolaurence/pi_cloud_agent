import { Body, Controller, Param, Post } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
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
}
