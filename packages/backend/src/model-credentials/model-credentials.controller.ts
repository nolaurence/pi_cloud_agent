import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import type { ModelCredentialProvider } from "@pi-cloud/shared";
import { IsIn, IsOptional, IsString, IsUrl, MinLength, ValidateIf } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModelCredentialsService } from "./model-credentials.service";

const PROVIDERS: ModelCredentialProvider[] = ["openai", "anthropic", "google", "deepseek", "openrouter", "xai", "groq", "mistral", "siliconflow"];

class CredentialParams {
  @IsIn(PROVIDERS)
  provider!: ModelCredentialProvider;
}

class SetCredentialDto {
  @IsString()
  @MinLength(8)
  apiKey!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUrl({ require_tld: false, require_protocol: true })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;
}

@Controller("model-credentials")
@UseGuards(JwtAuthGuard)
export class ModelCredentialsController {
  constructor(private readonly credentials: ModelCredentialsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.credentials.list(req.user!.id);
  }

  @Put(":provider")
  set(@Req() req: Request, @Param() params: CredentialParams, @Body() dto: SetCredentialDto) {
    return this.credentials.set(req.user!.id, params.provider, dto);
  }

  @Delete(":provider")
  remove(@Req() req: Request, @Param() params: CredentialParams) {
    return this.credentials.remove(req.user!.id, params.provider);
  }
}
