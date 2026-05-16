import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SandboxModule } from "../sandbox/sandbox.module";
import { BrowserConnectionEntity } from "./browser-connection.entity";
import { BrowserConnectionsController } from "./browser-connections.controller";
import { BrowserConnectionsService } from "./browser-connections.service";

@Module({
  imports: [TypeOrmModule.forFeature([BrowserConnectionEntity]), SandboxModule],
  controllers: [BrowserConnectionsController],
  providers: [BrowserConnectionsService]
})
export class BrowserConnectionsModule {}
