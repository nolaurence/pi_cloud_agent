import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { IsBase64, IsBoolean, IsString } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SkillsService } from "./skills.service";

class InstallSkillDto {
  @IsString()
  fileName!: string;

  @IsBase64()
  contentBase64!: string;
}

class ToggleSkillDto {
  @IsBoolean()
  enabled!: boolean;
}

@Controller("skills")
@UseGuards(JwtAuthGuard)
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.skills.list(req.user!.id);
  }

  @Put("install")
  install(@Req() req: Request, @Body() dto: InstallSkillDto) {
    return this.skills.install(req.user!.id, dto);
  }

  @Put(":skillId/enabled")
  setEnabled(@Req() req: Request, @Param("skillId") skillId: string, @Body() dto: ToggleSkillDto) {
    return this.skills.setEnabled(req.user!.id, skillId, dto.enabled);
  }
}
