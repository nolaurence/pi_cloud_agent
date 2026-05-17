import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ModelCredentialsModule } from "../model-credentials/model-credentials.module";
import { SessionsModule } from "../sessions/sessions.module";
import { ScheduledTaskRunEntity } from "./scheduled-task-run.entity";
import { ScheduledTaskEntity } from "./scheduled-task.entity";
import { ScheduledTasksController } from "./scheduled-tasks.controller";
import { ScheduledTasksService } from "./scheduled-tasks.service";

@Module({
  imports: [TypeOrmModule.forFeature([ScheduledTaskEntity, ScheduledTaskRunEntity]), SessionsModule, ModelCredentialsModule],
  controllers: [ScheduledTasksController],
  providers: [ScheduledTasksService]
})
export class ScheduledTasksModule {}
