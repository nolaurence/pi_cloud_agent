import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SandboxModule } from "../sandbox/sandbox.module";
import { AgentMessageEntity } from "./agent-message.entity";
import { AgentSessionEntity } from "./agent-session.entity";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [TypeOrmModule.forFeature([AgentSessionEntity, AgentMessageEntity]), SandboxModule],
  controllers: [SessionsController],
  providers: [SessionsService]
})
export class SessionsModule {}
