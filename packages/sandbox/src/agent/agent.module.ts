import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AgentController } from "./agent.controller";
import { PiRpcService } from "./pi-rpc.service";

@Module({
  imports: [WorkspaceModule],
  controllers: [AgentController],
  providers: [PiRpcService]
})
export class AgentModule {}
