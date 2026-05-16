import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { SandboxClient } from "./sandbox.client";

@Module({
  imports: [HttpModule],
  providers: [SandboxClient],
  exports: [SandboxClient]
})
export class SandboxModule {}
