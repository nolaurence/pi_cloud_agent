import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [SkillsController],
  providers: [SkillsService]
})
export class SkillsModule {}
