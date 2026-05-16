import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AgentSessionSummary, AgentTraceItem, PromptResponse } from "@pi-cloud/shared";
import { Repository } from "typeorm";
import { SandboxClient } from "../sandbox/sandbox.client";
import { AgentMessageEntity } from "./agent-message.entity";
import { AgentSessionEntity } from "./agent-session.entity";

interface SandboxStreamEvent {
  type: "event" | "done" | "error";
  event?: unknown;
  assistantText?: string;
  eventCount?: number;
  message?: string;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(AgentSessionEntity) private readonly sessions: Repository<AgentSessionEntity>,
    @InjectRepository(AgentMessageEntity) private readonly messagesRepo: Repository<AgentMessageEntity>,
    private readonly sandbox: SandboxClient
  ) {}

  async list(userId: string): Promise<AgentSessionSummary[]> {
    const sessions = await this.sessions.find({ where: { userId }, order: { updatedAt: "DESC" } });
    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      provider: session.provider,
      model: session.model,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString()
    }));
  }

  async create(userId: string, input: { title?: string; provider?: string; model?: string }) {
    const session = await this.sessions.save(
      this.sessions.create({
        userId,
        title: input.title ?? "Untitled session",
        provider: input.provider,
        model: input.model,
        status: "idle"
      })
    );

    const sandboxSession = await this.sandbox.post<{ id: string }>("/agent/sessions", {
      userId,
      sessionId: session.id,
      provider: input.provider,
      model: input.model
    });

    session.sandboxSessionId = sandboxSession.id;
    await this.sessions.save(session);
    return session;
  }

  async messages(userId: string, sessionId: string) {
    await this.requireOwnedSession(userId, sessionId);
    return this.messagesRepo.find({ where: { sessionId }, order: { createdAt: "ASC" } });
  }

  async prompt(userId: string, sessionId: string, message: string): Promise<PromptResponse> {
    const session = await this.requireOwnedSession(userId, sessionId);
    await this.messagesRepo.save(this.messagesRepo.create({ sessionId, role: "user", content: message }));

    session.status = "running";
    await this.sessions.save(session);

    try {
      const response = await this.sandbox.post<PromptResponse>(`/agent/sessions/${sessionId}/prompt`, {
        userId,
        message,
        provider: session.provider,
        model: session.model
      });
      const assistantTrace = buildAgentTrace(response.events);
      const safeResponse: PromptResponse = {
        ...response,
        events: sanitizeEventsForClient(response.events),
        assistantTrace
      };

      if (response.assistantText) {
        await this.messagesRepo.save(
          this.messagesRepo.create({
            sessionId,
            role: "assistant",
            content: response.assistantText,
            metadata: { eventCount: response.events.length, trace: assistantTrace }
          })
        );
      }
      session.status = "idle";
      await this.sessions.save(session);
      return safeResponse;
    } catch (error) {
      session.status = "failed";
      await this.sessions.save(session);
      throw error;
    }
  }

  /** Stream agent events in real-time from the sandbox to the frontend. */
  async promptStreaming(
    userId: string,
    sessionId: string,
    message: string,
    callbacks: {
      onTraceItem: (item: AgentTraceItem) => void;
      onComplete: (result: { assistantText: string; assistantTrace: AgentTraceItem[]; eventCount: number }) => void;
      onError: (error: Error) => void;
    }
  ): Promise<void> {
    const session = await this.requireOwnedSession(userId, sessionId);
    await this.messagesRepo.save(this.messagesRepo.create({ sessionId, role: "user", content: message }));

    session.status = "running";
    await this.sessions.save(session);

    const rawEvents: unknown[] = [];
    let eventIndex = 0;
    let doneText = "";
    let doneEventCount = 0;

    await this.sandbox.postStream<SandboxStreamEvent>(
      `/agent/sessions/${sessionId}/prompt/stream`,
      { userId, message, provider: session.provider, model: session.model },
      {
        onData: (data) => {
          if (data.type === "event" && data.event) {
            rawEvents.push(data.event);
            const traceItem = buildSingleTraceItem(data.event, eventIndex++);
            if (traceItem) {
              try { callbacks.onTraceItem(traceItem); } catch { /* ignore */ }
            }
          } else if (data.type === "done") {
            doneText = data.assistantText ?? "";
            doneEventCount = data.eventCount ?? rawEvents.length;
          }
        },
        onComplete: async () => {
          const assistantTrace = buildAgentTrace(rawEvents);
          const assistantText = doneText;

          if (assistantText) {
            await this.messagesRepo.save(
              this.messagesRepo.create({
                sessionId,
                role: "assistant",
                content: assistantText,
                metadata: { eventCount: doneEventCount, trace: assistantTrace }
              })
            );
          }

          session.status = "idle";
          await this.sessions.save(session);

          callbacks.onComplete({
            assistantText,
            assistantTrace,
            eventCount: doneEventCount
          });
        },
        onError: async (error) => {
          session.status = "failed";
          await this.sessions.save(session);
          callbacks.onError(error);
        }
      }
    );
  }

  private async requireOwnedSession(userId: string, sessionId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (session.userId !== userId) throw new ForbiddenException("Session belongs to another user");
    return session;
  }
}

const SENSITIVE_KEY_PATTERN = /(api[-_ ]?key|token|authorization|password|secret|credential|cookie|thought|signature)/i;

/** Build a single trace item from a streaming event for real-time display. */
function buildSingleTraceItem(event: unknown, index: number): AgentTraceItem | null {
  if (!isRecord(event)) return null;

  const eventType = readString(event.type) ?? "event";
  const timestamp = readTimestamp(event);

  // Skip lifecycle events — only show thinking, tool calls, and tool results
  if (eventType === "agent_start" || eventType === "agent_end" || eventType === "turn_start" || eventType === "turn_end") {
    return null;
  }

  if (eventType === "message_update") {
    const assistantEvent = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : undefined;
    const assistantEventType = readString(assistantEvent?.type);

    if (assistantEventType === "thinking_start") {
      return { id: `${index}-thinking-start`, type: "thinking", title: "🧠 推理中…", status: "running", timestamp, raw: sanitizeForClient(event) };
    }
    if (assistantEventType === "thinking_delta" && typeof assistantEvent?.delta === "string") {
      return { id: `${index}-thinking-delta`, type: "thinking", title: assistantEvent.delta, status: "running", timestamp, raw: sanitizeForClient(event) };
    }
    if (assistantEventType === "thinking_end") {
      const thinkingContent = typeof assistantEvent?.content === "string" ? assistantEvent.content : undefined;
      return { id: `${index}-thinking-end`, type: "thinking", title: "推理完成", detail: thinkingContent, status: "done", timestamp, raw: sanitizeForClient(event) };
    }
    if (assistantEventType === "toolcall_end" && isRecord(assistantEvent?.toolCall)) {
      const toolName = readString(assistantEvent.toolCall.name) ?? "tool";
      return {
        id: readString(assistantEvent.toolCall.id) ?? `${index}-toolcall-end`,
        type: "tool_call",
        title: `🔧 ${toolName}`,
        detail: stringifyDetail(assistantEvent.toolCall.arguments),
        status: "running",
        timestamp,
        raw: sanitizeForClient(event)
      };
    }
    if (assistantEventType === "text_end" && typeof assistantEvent?.content === "string") {
      return { id: `${index}-text`, type: "message", title: assistantEvent.content, status: "done", timestamp, raw: sanitizeForClient(event) };
    }
    return null;
  }

  if (eventType === "tool_execution_start") {
    const toolName = readString(event.toolName) ?? "tool";
    return {
      id: readString(event.toolCallId) ?? `${index}-tool-start`,
      type: "tool_call",
      title: `🔧 ${toolName}`,
      detail: stringifyDetail(event.args),
      status: "running",
      timestamp,
      raw: sanitizeForClient(event)
    };
  }

  if (eventType === "tool_execution_end") {
    const toolName = readString(event.toolName) ?? "tool";
    return {
      id: `${readString(event.toolCallId) ?? index}-end`,
      type: "tool_result",
      title: `📋 ${toolName} 结果`,
      detail: summarizeToolResult(event.result),
      status: event.isError === true ? "error" : "done",
      timestamp,
      raw: sanitizeForClient(event)
    };
  }

  return null;
}

function buildAgentTrace(events: unknown[] = []): AgentTraceItem[] {
  const trace: AgentTraceItem[] = [];
  const seen = new Set<string>();

  const add = (item: AgentTraceItem) => {
    const dedupeKey = `${item.type}:${item.id}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    trace.push(item);
  };

  events.forEach((event, index) => {
    if (!isRecord(event)) return;
    const eventType = readString(event.type) ?? "event";
    const timestamp = readTimestamp(event);

    // Skip lifecycle events
    if (eventType === "agent_start" || eventType === "agent_end" || eventType === "turn_start") {
      return;
    }

    if (eventType === "turn_end") {
      extractMessageTrace(event.message, `${index}-turn-message`, timestamp, add);
      return;
    }

    if (eventType === "message_update") {
      const assistantEvent = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : undefined;
      const assistantEventType = readString(assistantEvent?.type);
      if (assistantEventType?.startsWith("thinking_")) {
        const thinkingContent = assistantEventType === "thinking_end" && typeof assistantEvent?.content === "string"
          ? assistantEvent.content
          : undefined;
        add({
          id: `${index}-thinking-${readNumber(assistantEvent?.contentIndex) ?? 0}`,
          type: "thinking",
          title: assistantEventType === "thinking_end" ? "推理完成" : "推理中…",
          detail: thinkingContent,
          status: assistantEventType === "thinking_end" ? "done" : "running",
          timestamp,
          raw: sanitizeForClient(event)
        });
      }
      if (assistantEventType === "toolcall_end" && isRecord(assistantEvent?.toolCall)) {
        addToolCall(assistantEvent.toolCall, `${index}-toolcall-end`, timestamp, event, add);
      }
      extractMessageTrace(event.message, `${index}-message-update`, timestamp, add);
      return;
    }

    if (eventType === "message_start" || eventType === "message_end") {
      extractMessageTrace(event.message, `${index}-${eventType}`, timestamp, add);
      return;
    }

    if (eventType === "tool_execution_start") {
      const toolName = readString(event.toolName) ?? "tool";
      add({
        id: readString(event.toolCallId) ?? `${index}-tool-start`,
        type: "tool_call",
        title: `调用工具：${toolName}`,
        detail: stringifyDetail(event.args),
        status: "running",
        timestamp,
        raw: sanitizeForClient(event)
      });
      return;
    }

    if (eventType === "tool_execution_update") {
      const toolName = readString(event.toolName) ?? "tool";
      add({
        id: `${readString(event.toolCallId) ?? index}-update-${index}`,
        type: "tool_update",
        title: `工具更新：${toolName}`,
        detail: stringifyDetail(event.partialResult),
        status: "running",
        timestamp,
        raw: sanitizeForClient(event)
      });
      return;
    }

    if (eventType === "tool_execution_end") {
      const toolName = readString(event.toolName) ?? "tool";
      add({
        id: `${readString(event.toolCallId) ?? index}-end`,
        type: "tool_result",
        title: `工具结果：${toolName}`,
        detail: summarizeToolResult(event.result),
        status: event.isError === true ? "error" : "done",
        timestamp,
        raw: sanitizeForClient(event)
      });
      return;
    }

    if (eventType === "tool_call") {
      const toolName = readString(event.toolName) ?? "tool";
      add({
        id: readString(event.toolCallId) ?? `${index}-tool-call`,
        type: "tool_call",
        title: `准备工具：${toolName}`,
        detail: stringifyDetail(event.input),
        status: "running",
        timestamp,
        raw: sanitizeForClient(event)
      });
      return;
    }

    if (eventType === "tool_result") {
      const toolName = readString(event.toolName) ?? "tool";
      add({
        id: `${readString(event.toolCallId) ?? index}-result`,
        type: "tool_result",
        title: `工具返回：${toolName}`,
        detail: summarizeToolResult(event.content),
        status: event.isError === true ? "error" : "done",
        timestamp,
        raw: sanitizeForClient(event)
      });
      return;
    }

    if (eventType === "model_select") {
      const model = isRecord(event.model) ? readString(event.model.id) ?? readString(event.model.name) : undefined;
      add({ id: `${index}-model`, type: "status", title: model ? `选择模型：${model}` : "选择模型", status: "done", timestamp, raw: sanitizeForClient(event) });
    }
  });

  return trace;
}

function extractMessageTrace(message: unknown, idPrefix: string, timestamp: string | undefined, add: (item: AgentTraceItem) => void) {
  if (!isRecord(message)) return;
  if (message.role === "assistant" && Array.isArray(message.content)) {
    message.content.forEach((block, index) => {
      if (!isRecord(block)) return;
      if (block.type === "thinking") {
        add({
          id: `${idPrefix}-thinking-${index}`,
          type: "thinking",
          title: typeof block.thinking === "string" ? block.thinking : "推理内容",
          detail: undefined,
          status: "done",
          timestamp,
          raw: sanitizeForClient(block)
        });
      }
      if (block.type === "text" && typeof block.text === "string") {
        add({
          id: `${idPrefix}-text-${index}`,
          type: "message",
          title: block.text,
          status: "done",
          timestamp,
          raw: sanitizeForClient(block)
        });
      }
      if (block.type === "toolCall") addToolCall(block, `${idPrefix}-tool-${index}`, timestamp, block, add);
    });
  }

  if (message.role === "toolResult") {
    const toolName = readString(message.toolName) ?? "tool";
    add({
      id: `${readString(message.toolCallId) ?? idPrefix}-message-result`,
      type: "tool_result",
      title: `工具消息：${toolName}`,
      detail: summarizeToolResult(message.content),
      status: message.isError === true ? "error" : "done",
      timestamp,
      raw: sanitizeForClient(message)
    });
  }
}

function addToolCall(block: Record<string, unknown>, fallbackId: string, timestamp: string | undefined, raw: unknown, add: (item: AgentTraceItem) => void) {
  const toolName = readString(block.name) ?? readString(block.toolName) ?? "tool";
  add({
    id: readString(block.id) ?? readString(block.toolCallId) ?? fallbackId,
    type: "tool_call",
    title: `工具调用：${toolName}`,
    detail: stringifyDetail(block.arguments ?? block.input),
    status: "running",
    timestamp,
    raw: sanitizeForClient(raw)
  });
}

function sanitizeEventsForClient(events: unknown[] = []) {
  return events.map((event) => sanitizeForClient(event));
}

function sanitizeForClient(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeForClient(item));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeForClient(nested);
  }
  return output;
}

function summarizeToolResults(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return `本轮返回 ${value.length} 个工具结果`;
}

function summarizeToolResult(value: unknown) {
  const text = extractText(value);
  return text || stringifyDetail(value);
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.map(extractText).filter(Boolean).join("\n");
    return text || undefined;
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.text === "string") return value.text;
  if (Array.isArray(value.content)) return extractText(value.content);
  return undefined;
}

function stringifyDetail(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(sanitizeForClient(value), null, 2);
  } catch {
    return String(value);
  }
}

function readTimestamp(value: Record<string, unknown>) {
  const raw = readNumber(value.timestamp) ?? readNumber(value.createdAt);
  if (!raw) return undefined;
  return new Date(raw).toISOString();
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
