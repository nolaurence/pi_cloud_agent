import { Module } from "@nestjs/common";
import { SandboxModule } from "../sandbox/sandbox.module";
import { ModelCredentialsController } from "./model-credentials.controller";
import { ModelCredentialsService } from "./model-credentials.service";

@Module({
  imports: [SandboxModule],
  controllers: [ModelCredentialsController],
  providers: [ModelCredentialsService]
})
export class ModelCredentialsModule {}
