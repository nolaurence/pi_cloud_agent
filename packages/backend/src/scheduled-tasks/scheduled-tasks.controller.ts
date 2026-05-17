import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { CreateScheduledTaskInput, ScheduledTaskScheduleType, UpdateScheduledTaskInput } from "@pi-cloud/shared";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ScheduledTasksService } from "./scheduled-tasks.service";

const SCHEDULE_TYPES: ScheduledTaskScheduleType[] = ["daily", "weekdays", "weekly"];

class CreateScheduledTaskDto implements CreateScheduledTaskInput {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsIn(SCHEDULE_TYPES)
  scheduleType!: ScheduledTaskScheduleType;

  @Matches(/^\d{2}:\d{2}$/)
  timeOfDay!: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class UpdateScheduledTaskDto implements UpdateScheduledTaskInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsIn(SCHEDULE_TYPES)
  scheduleType?: ScheduledTaskScheduleType;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  timeOfDay?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Controller("scheduled-tasks")
@UseGuards(JwtAuthGuard)
export class ScheduledTasksController {
  constructor(private readonly tasks: ScheduledTasksService) {}

  @Get()
  list(@Req() req: Request) {
    return this.tasks.list(req.user!.id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateScheduledTaskDto) {
    return this.tasks.create(req.user!.id, dto);
  }

  @Patch(":id")
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateScheduledTaskDto) {
    return this.tasks.update(req.user!.id, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: Request, @Param("id") id: string) {
    return this.tasks.remove(req.user!.id, id);
  }

  @Post(":id/run")
  trigger(@Req() req: Request, @Param("id") id: string) {
    return this.tasks.trigger(req.user!.id, id);
  }

  @Get("runs")
  runs(@Req() req: Request) {
    return this.tasks.runsForUser(req.user!.id);
  }
}
