export type UserRole = "user" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  firstUserMessage?: string;
  provider?: string;
  model?: string;
  status: "idle" | "running" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  createdAt: string;
  metadata?: ChatMessageMetadata;
}

export type AgentTraceItemType = "status" | "thinking" | "tool_call" | "tool_update" | "tool_result" | "message";
export type AgentTraceItemStatus = "running" | "done" | "error";

export interface AgentTraceItem {
  id: string;
  type: AgentTraceItemType;
  title: string;
  detail?: string;
  raw?: unknown;
  status?: AgentTraceItemStatus;
  timestamp?: string;
}

export interface ChatMessageMetadata {
  eventCount?: number;
  trace?: AgentTraceItem[];
  [key: string]: unknown;
}

export interface BrowserConnectionStatus {
  id?: string;
  mode: "sandbox-cdp" | "user-extension";
  status: "disconnected" | "connecting" | "connected" | "error";
  newTabOnly: true;
  lastError?: string;
}

export type ModelCredentialProvider = "openai" | "anthropic" | "google" | "deepseek" | "openrouter" | "xai" | "groq" | "mistral" | "siliconflow";

export interface ModelCredentialStatus {
  provider: ModelCredentialProvider;
  label: string;
  configured: boolean;
  baseUrl?: string;
  model?: string;
  updatedAt?: string;
}

export interface SetModelCredentialInput {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface PromptRequest {
  message: string;
  provider?: string;
  model?: string;
}

export interface PromptResponse {
  sessionId: string;
  events: unknown[];
  assistantText: string;
  assistantTrace?: AgentTraceItem[];
}

export type ScheduledTaskScheduleType = "daily" | "weekdays" | "weekly";
export type ScheduledTaskStatus = "idle" | "running" | "failed";
export type ScheduledTaskRunStatus = "running" | "success" | "failed";
export type ScheduledTaskRunTrigger = "scheduled" | "manual";

export interface ScheduledTaskSummary {
  id: string;
  title: string;
  prompt: string;
  scheduleType: ScheduledTaskScheduleType;
  timeOfDay: string;
  weekdays?: number[];
  timezone: string;
  enabled: boolean;
  status: ScheduledTaskStatus;
  lastRunAt?: string;
  lastRunStatus?: ScheduledTaskRunStatus;
  nextRunAt?: string;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskRunSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  trigger: ScheduledTaskRunTrigger;
  status: ScheduledTaskRunStatus;
  sessionId?: string;
  output?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
}

export interface CreateScheduledTaskInput {
  title: string;
  prompt: string;
  scheduleType: ScheduledTaskScheduleType;
  timeOfDay: string;
  weekdays?: number[];
  timezone?: string;
  enabled?: boolean;
}

export type UpdateScheduledTaskInput = Partial<CreateScheduledTaskInput>;

export interface InstalledSkillSummary {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}
