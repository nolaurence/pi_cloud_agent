import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import type { ModelCredentialProvider } from "@pi-cloud/shared";
import { IsIn, IsOptional, IsString, IsUrl, MinLength, ValidateIf } from "class-validator";
import { ModelCredentialsService } from "./model-credentials.service";

const PROVIDERS: ModelCredentialProvider[] = ["openai", "anthropic", "google", "deepseek", "openrouter", "xai", "groq", "mistral", "siliconflow"];

class UserCredentialParams {
  @IsString()
  userId!: string;
}

class CredentialParams extends UserCredentialParams {
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
export class ModelCredentialsController {
  constructor(private readonly credentials: ModelCredentialsService) {}

  @Get(":userId")
  list(@Param() params: UserCredentialParams) {
    return this.credentials.list(params.userId);
  }

  @Put(":userId/:provider")
  set(@Param() params: CredentialParams, @Body() dto: SetCredentialDto) {
    return this.credentials.set(params.userId, params.provider, dto);
  }

  @Delete(":userId/:provider")
  remove(@Param() params: CredentialParams) {
    return this.credentials.remove(params.userId, params.provider);
  }
}
