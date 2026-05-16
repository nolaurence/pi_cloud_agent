import { Body, Controller, Post } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { BrowserConnectionService } from "./browser-connection.service";

class ExtensionDto {
  @IsString()
  userId!: string;

  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  cdpEndpoint?: string;

  @IsOptional()
  @IsBoolean()
  newTabOnly?: boolean;
}

class SandboxCdpDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  newTabOnly?: boolean;
}

@Controller("browser")
export class BrowserController {
  constructor(private readonly browser: BrowserConnectionService) {}

  @Post("extension")
  extension(@Body() dto: ExtensionDto) {
    return this.browser.connectUserExtension(dto);
  }

  @Post("sandbox-cdp")
  sandboxCdp(@Body() dto: SandboxCdpDto) {
    return this.browser.useSandboxCdp(dto.userId);
  }
}
