import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AgentModule } from "./agent/agent.module";
import { BrowserModule } from "./browser/browser.module";
import { ModelCredentialsModule } from "./model-credentials/model-credentials.module";
import { WorkspaceModule } from "./workspace/workspace.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), WorkspaceModule, AgentModule, BrowserModule, ModelCredentialsModule]
})
export class AppModule {}
