import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module";
import { BrowserController } from "./browser.controller";
import { BrowserConnectionService } from "./browser-connection.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [BrowserController],
  providers: [BrowserConnectionService]
})
export class BrowserModule {}
