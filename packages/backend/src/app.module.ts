import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { BrowserConnectionEntity } from "./browser-connections/browser-connection.entity";
import { BrowserConnectionsModule } from "./browser-connections/browser-connections.module";
import { ModelCredentialsModule } from "./model-credentials/model-credentials.module";
import { ScheduledTaskRunEntity } from "./scheduled-tasks/scheduled-task-run.entity";
import { ScheduledTaskEntity } from "./scheduled-tasks/scheduled-task.entity";
import { ScheduledTasksModule } from "./scheduled-tasks/scheduled-tasks.module";
import { AgentMessageEntity } from "./sessions/agent-message.entity";
import { AgentSessionEntity } from "./sessions/agent-session.entity";
import { SessionsModule } from "./sessions/sessions.module";
import { SandboxModule } from "./sandbox/sandbox.module";
import { UserEntity } from "./users/user.entity";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "mysql",
        host: config.get("MYSQL_HOST") ?? "127.0.0.1",
        port: Number(config.get("MYSQL_PORT") ?? 3306),
        username: config.get("MYSQL_USER") ?? "pi_cloud",
        password: config.get("MYSQL_PASSWORD") ?? "pi_cloud",
        database: config.get("MYSQL_DATABASE") ?? "pi_cloud_agent",
        entities: [UserEntity, AgentSessionEntity, AgentMessageEntity, BrowserConnectionEntity, ScheduledTaskEntity, ScheduledTaskRunEntity],
        synchronize: false
      })
    }),
    AuthModule,
    UsersModule,
    SandboxModule,
    SessionsModule,
    BrowserConnectionsModule,
    ModelCredentialsModule,
    ScheduledTasksModule
  ]
})
export class AppModule {}
