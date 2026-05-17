import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { CreateScheduledTaskInput, ScheduledTaskRunSummary, ScheduledTaskSummary, UpdateScheduledTaskInput } from "@pi-cloud/shared";
import { LessThanOrEqual, Repository } from "typeorm";
import { ModelCredentialsService } from "../model-credentials/model-credentials.service";
import { SessionsService } from "../sessions/sessions.service";
import { ScheduledTaskRunEntity } from "./scheduled-task-run.entity";
import { ScheduledTaskEntity } from "./scheduled-task.entity";

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

@Injectable()
export class ScheduledTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledTasksService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(ScheduledTaskEntity) private readonly tasks: Repository<ScheduledTaskEntity>,
    @InjectRepository(ScheduledTaskRunEntity) private readonly runs: Repository<ScheduledTaskRunEntity>,
    private readonly sessions: SessionsService,
    private readonly credentials: ModelCredentialsService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDueTasks(), 60_000);
    void this.runDueTasks();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(userId: string): Promise<ScheduledTaskSummary[]> {
    const items = await this.tasks.find({ where: { userId }, order: { updatedAt: "DESC" } });
    return items.map(toTaskSummary);
  }

  async runsForUser(userId: string): Promise<ScheduledTaskRunSummary[]> {
    const items = await this.runs.find({ where: { userId }, relations: { task: true }, order: { createdAt: "DESC" }, take: 100 });
    return items.map(toRunSummary);
  }

  async create(userId: string, input: CreateScheduledTaskInput): Promise<ScheduledTaskSummary> {
    const normalized = normalizeTaskInput(input);
    const task = await this.tasks.save(
      this.tasks.create({
        userId,
        ...normalized,
        status: "idle",
        nextRunAt: normalized.enabled ? computeNextRunAt(normalized.scheduleType, normalized.timeOfDay, normalized.weekdays, undefined, normalized.timezone) : undefined
      })
    );
    return toTaskSummary(task);
  }

  async update(userId: string, taskId: string, input: UpdateScheduledTaskInput): Promise<ScheduledTaskSummary> {
    const task = await this.requireOwnedTask(userId, taskId);
    const normalized = normalizeTaskInput({
      title: input.title ?? task.title,
      prompt: input.prompt ?? task.prompt,
      scheduleType: input.scheduleType ?? task.scheduleType,
      timeOfDay: input.timeOfDay ?? task.timeOfDay,
      weekdays: input.weekdays ?? task.weekdays,
      timezone: input.timezone ?? task.timezone,
      enabled: input.enabled ?? task.enabled
    });

    Object.assign(task, normalized);
    task.nextRunAt = normalized.enabled ? computeNextRunAt(normalized.scheduleType, normalized.timeOfDay, normalized.weekdays, undefined, normalized.timezone) : undefined;
    if (!normalized.enabled && task.status === "running") task.status = "idle";
    return toTaskSummary(await this.tasks.save(task));
  }

  async remove(userId: string, taskId: string) {
    const task = await this.requireOwnedTask(userId, taskId);
    await this.tasks.remove(task);
    return { ok: true };
  }

  async trigger(userId: string, taskId: string): Promise<ScheduledTaskRunSummary> {
    const task = await this.requireOwnedTask(userId, taskId);
    return this.executeTask(task, "manual");
  }

  private async runDueTasks() {
    const dueTasks = await this.tasks.find({
      where: {
        enabled: true,
        nextRunAt: LessThanOrEqual(new Date())
      },
      order: { nextRunAt: "ASC" },
      take: 10
    });

    for (const task of dueTasks) {
      await this.executeTask(task, "scheduled").catch((error) => {
        this.logger.error(`Scheduled task ${task.id} failed`, error instanceof Error ? error.stack : String(error));
      });
    }
  }

  private async executeTask(task: ScheduledTaskEntity, trigger: "scheduled" | "manual"): Promise<ScheduledTaskRunSummary> {
    if (task.status === "running") {
      throw new BadRequestException("Task is already running");
    }

    task.status = "running";
    await this.tasks.save(task);

    const run = await this.runs.save(
      this.runs.create({
        taskId: task.id,
        userId: task.userId,
        trigger,
        status: "running",
        startedAt: new Date()
      })
    );

    try {
      const modelConfig = await this.resolveModelConfig(task.userId);
      const session = await this.sessions.create(task.userId, {
        title: task.title,
        ...modelConfig
      });
      const response = await this.sessions.prompt(task.userId, session.id, task.prompt);

      run.status = "success";
      run.sessionId = session.id;
      run.output = response.assistantText;
      run.finishedAt = new Date();

      task.status = "idle";
      task.lastRunAt = run.finishedAt;
      task.lastRunStatus = "success";
      task.runCount += 1;
      task.nextRunAt = task.enabled ? computeNextRunAt(task.scheduleType, task.timeOfDay, task.weekdays, new Date(run.finishedAt.getTime() + 1000), task.timezone) : undefined;
      await this.runs.save(run);
      await this.tasks.save(task);
      return toRunSummary({ ...run, task });
    } catch (error) {
      const finishedAt = new Date();
      run.status = "failed";
      run.error = error instanceof Error ? error.message : String(error);
      run.finishedAt = finishedAt;

      task.status = "failed";
      task.lastRunAt = finishedAt;
      task.lastRunStatus = "failed";
      task.runCount += 1;
      task.nextRunAt = task.enabled ? computeNextRunAt(task.scheduleType, task.timeOfDay, task.weekdays, new Date(finishedAt.getTime() + 1000), task.timezone) : undefined;
      await this.runs.save(run);
      await this.tasks.save(task);
      return toRunSummary({ ...run, task });
    }
  }

  private async resolveModelConfig(userId: string) {
    try {
      const siliconFlow = (await this.credentials.list(userId)).find((item) => item.provider === "siliconflow" && item.configured && item.model);
      return siliconFlow?.model ? { provider: "siliconflow", model: siliconFlow.model } : {};
    } catch {
      return {};
    }
  }

  private async requireOwnedTask(userId: string, taskId: string) {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Scheduled task not found");
    if (task.userId !== userId) throw new ForbiddenException("Scheduled task belongs to another user");
    return task;
  }
}

function normalizeTaskInput(input: CreateScheduledTaskInput) {
  const title = input.title?.trim();
  const prompt = input.prompt?.trim();
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  const enabled = input.enabled ?? true;

  if (!title) throw new BadRequestException("Task title is required");
  if (!prompt) throw new BadRequestException("Task prompt is required");
  if (!["daily", "weekdays", "weekly"].includes(input.scheduleType)) throw new BadRequestException("Invalid schedule type");
  if (!/^\d{2}:\d{2}$/.test(input.timeOfDay)) throw new BadRequestException("Invalid time format");

  const [hour, minute] = input.timeOfDay.split(":").map(Number);
  if (hour > 23 || minute > 59) throw new BadRequestException("Invalid time format");

  let weekdays = input.scheduleType === "weekdays" ? [1, 2, 3, 4, 5] : input.weekdays;
  if (input.scheduleType === "daily") weekdays = undefined;
  if (input.scheduleType === "weekly") {
    weekdays = Array.from(new Set((weekdays?.length ? weekdays : [1]).map(Number))).filter((day) => WEEKDAY_VALUES.includes(day));
    if (!weekdays.length) throw new BadRequestException("At least one weekday is required");
  }

  return {
    title: title.slice(0, 180),
    prompt,
    scheduleType: input.scheduleType,
    timeOfDay: input.timeOfDay,
    weekdays,
    timezone,
    enabled
  };
}

function computeNextRunAt(scheduleType: "daily" | "weekdays" | "weekly", timeOfDay: string, weekdays?: number[], from = new Date(), timezone = DEFAULT_TIMEZONE) {
  const [hour, minute] = timeOfDay.split(":").map(Number);
  const allowedDays = scheduleType === "daily" ? [0, 1, 2, 3, 4, 5, 6] : scheduleType === "weekdays" ? [1, 2, 3, 4, 5] : weekdays?.length ? weekdays : [1];
  const nowParts = getZonedParts(from, timezone);
  for (let offset = 0; offset < 14; offset += 1) {
    const dayParts = getZonedParts(new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + offset, 12)), timezone);
    if (!allowedDays.includes(dayParts.weekday)) continue;
    const candidate = zonedTimeToUtc(dayParts.year, dayParts.month, dayParts.day, hour, minute, timezone);
    if (candidate > from) return candidate;
  }
  const fallbackParts = getZonedParts(new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1, 12)), timezone);
  return zonedTimeToUtc(fallbackParts.year, fallbackParts.month, fallbackParts.day, hour, minute, timezone);
}

function getZonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = getTimezoneOffsetMs(new Date(utcGuess), timezone);
  let result = new Date(utcGuess - firstOffset);
  const secondOffset = getTimezoneOffsetMs(result, timezone);
  if (secondOffset !== firstOffset) result = new Date(utcGuess - secondOffset);
  return result;
}

function getTimezoneOffsetMs(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function toTaskSummary(task: ScheduledTaskEntity): ScheduledTaskSummary {
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    scheduleType: task.scheduleType,
    timeOfDay: task.timeOfDay,
    weekdays: task.weekdays,
    timezone: task.timezone,
    enabled: Boolean(task.enabled),
    status: task.status,
    lastRunAt: task.lastRunAt?.toISOString(),
    lastRunStatus: task.lastRunStatus,
    nextRunAt: task.nextRunAt?.toISOString(),
    runCount: task.runCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

function toRunSummary(run: ScheduledTaskRunEntity & { task?: ScheduledTaskEntity }): ScheduledTaskRunSummary {
  return {
    id: run.id,
    taskId: run.taskId,
    taskTitle: run.task?.title ?? "定时任务",
    trigger: run.trigger,
    status: run.status,
    sessionId: run.sessionId,
    output: run.output,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    createdAt: run.createdAt.toISOString()
  };
}
