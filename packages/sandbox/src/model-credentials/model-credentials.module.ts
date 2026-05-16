import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module";
import { ModelCredentialsController } from "./model-credentials.controller";
import { ModelCredentialsService } from "./model-credentials.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [ModelCredentialsController],
  providers: [ModelCredentialsService]
})
export class ModelCredentialsModule {}
