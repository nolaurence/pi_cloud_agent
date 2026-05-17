import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { IsBase64, IsBoolean, IsString } from "class-validator";
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

@Controller("skills/:userId")
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(@Param("userId") userId: string) {
    return this.skills.list(userId);
  }

  @Put("install")
  install(@Param("userId") userId: string, @Body() dto: InstallSkillDto) {
    return this.skills.install(userId, dto);
  }

  @Put(":skillId/enabled")
  setEnabled(@Param("userId") userId: string, @Param("skillId") skillId: string, @Body() dto: ToggleSkillDto) {
    return this.skills.setEnabled(userId, skillId, dto.enabled);
  }
}
