import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AgentModule } from "./agent/agent.module";
import { BrowserModule } from "./browser/browser.module";
import { ModelCredentialsModule } from "./model-credentials/model-credentials.module";
import { SkillsModule } from "./skills/skills.module";
import { WorkspaceModule } from "./workspace/workspace.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), WorkspaceModule, AgentModule, BrowserModule, ModelCredentialsModule, SkillsModule]
})
export class AppModule {}
