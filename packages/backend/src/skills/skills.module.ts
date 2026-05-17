import { Module } from "@nestjs/common";
import { SandboxModule } from "../sandbox/sandbox.module";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";

@Module({
  imports: [SandboxModule],
  controllers: [SkillsController],
  providers: [SkillsService]
})
export class SkillsModule {}
