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

interface ToolTraceAggregate {
  item: AgentTraceItem;
  args?: unknown;
  updates: unknown[];
  result?: unknown;
  message?: unknown;
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
    const firstMessages = sessions.length
      ? await this.messagesRepo
          .createQueryBuilder("message")
          .select("message.sessionId", "sessionId")
          .addSelect("message.content", "content")
          .where("message.sessionId IN (:...sessionIds)", { sessionIds: sessions.map((session) => session.id) })
          .andWhere("message.role = :role", { role: "user" })
          .andWhere(
            "message.createdAt = " +
              this.messagesRepo
                .createQueryBuilder("firstMessage")
                .subQuery()
                .select("MIN(firstMessage.createdAt)")
                .from(AgentMessageEntity, "firstMessage")
                .where("firstMessage.sessionId = message.sessionId")
                .andWhere("firstMessage.role = :role")
                .getQuery()
          )
          .getRawMany<{ sessionId: string; content: string }>()
      : [];
    const firstMessageBySession = new Map(firstMessages.map((message) => [message.sessionId, message.content]));

    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      firstUserMessage: firstMessageBySession.get(session.id),
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
    const streamingTrace = new Map<string, AgentTraceItem>();
    const streamingThinkingState = createThinkingState();
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
            const traceItem = buildSingleTraceItem(data.event, eventIndex++, streamingThinkingState);
            if (traceItem) {
              streamingTrace.set(`${traceItem.type}:${traceItem.id}`, traceItem);
              try { callbacks.onTraceItem(traceItem); } catch { /* ignore */ }
            }
          } else if (data.type === "done") {
            doneText = data.assistantText ?? "";
            doneEventCount = data.eventCount ?? rawEvents.length;
          }
        },
        onComplete: async () => {
          const assistantTrace = compactTrace(buildAgentTrace(rawEvents));
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
            assistantTrace: assistantTrace.length ? assistantTrace : Array.from(streamingTrace.values()),
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
interface ThinkingState {
  activeSequenceByContentIndex: Map<number, number>;
  buffersBySequence: Map<number, string>;
  nextSequence: number;
}

function createThinkingState(): ThinkingState {
  return {
    activeSequenceByContentIndex: new Map(),
    buffersBySequence: new Map(),
    nextSequence: 0
  };
}

function buildSingleTraceItem(event: unknown, index: number, thinkingState: ThinkingState): AgentTraceItem | null {
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
    const contentIndex = readNumber(assistantEvent?.contentIndex) ?? 0;

    if (assistantEventType === "thinking_start") {
      const sequence = thinkingState.nextSequence++;
      thinkingState.activeSequenceByContentIndex.set(contentIndex, sequence);
      thinkingState.buffersBySequence.set(sequence, "");
      const thinkingId = thinkingTraceId(contentIndex, sequence);
      return { id: thinkingId, type: "thinking", title: "推理中…", status: "running", timestamp, raw: sanitizeForClient(event) };
    }
    if (assistantEventType === "thinking_delta" && typeof assistantEvent?.delta === "string") {
      const sequence = getActiveThinkingSequence(contentIndex, thinkingState);
      const nextText = `${thinkingState.buffersBySequence.get(sequence) ?? ""}${assistantEvent.delta}`;
      thinkingState.buffersBySequence.set(sequence, nextText);
      const thinkingId = thinkingTraceId(contentIndex, sequence);
      return { id: thinkingId, type: "thinking", title: summarizeInline(nextText) || "推理中…", detail: nextText, status: "running", timestamp, raw: sanitizeForClient(event) };
    }
    if (assistantEventType === "thinking_end") {
      const sequence = getActiveThinkingSequence(contentIndex, thinkingState);
      const thinkingContent = typeof assistantEvent?.content === "string" ? assistantEvent.content : thinkingState.buffersBySequence.get(sequence);
      if (thinkingContent) thinkingState.buffersBySequence.set(sequence, thinkingContent);
      const thinkingId = thinkingTraceId(contentIndex, sequence);
      thinkingState.activeSequenceByContentIndex.delete(contentIndex);
      return { id: thinkingId, type: "thinking", title: summarizeInline(thinkingContent) || "推理完成", detail: thinkingContent, status: "done", timestamp, raw: sanitizeForClient(event) };
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
        raw: undefined
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
      raw: undefined
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
      raw: undefined
    };
  }

  return null;
}

function buildAgentTrace(events: unknown[] = []): AgentTraceItem[] {
  const trace: AgentTraceItem[] = [];
  const seen = new Set<string>();
  const thinkingState = createThinkingState();
  const thinkingBySequence = new Map<number, AgentTraceItem>();
  const toolById = new Map<string, ToolTraceAggregate>();

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
      extractMessageTrace(event.message, `${index}-turn-message`, timestamp, add, {
        includeThinking: false,
        toolById,
        trace,
        seen
      });
      return;
    }

    if (eventType === "message_update") {
      const assistantEvent = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : undefined;
      const assistantEventType = readString(assistantEvent?.type);
      if (assistantEventType?.startsWith("thinking_")) {
        const contentIndex = readNumber(assistantEvent?.contentIndex) ?? 0;
        let sequence: number;
        if (assistantEventType === "thinking_start") {
          sequence = thinkingState.nextSequence++;
          thinkingState.activeSequenceByContentIndex.set(contentIndex, sequence);
          thinkingState.buffersBySequence.set(sequence, "");
        } else {
          sequence = getActiveThinkingSequence(contentIndex, thinkingState);
        }
        const thinkingContent = assistantEventType === "thinking_end" && typeof assistantEvent?.content === "string"
          ? assistantEvent.content
          : undefined;
        const previous = thinkingBySequence.get(sequence);
        const delta = assistantEventType === "thinking_delta" && typeof assistantEvent?.delta === "string" ? assistantEvent.delta : "";
        const detail = thinkingContent ?? `${previous?.detail ?? ""}${delta}`;
        thinkingState.buffersBySequence.set(sequence, detail);
        const nextItem: AgentTraceItem = {
          id: thinkingTraceId(contentIndex, sequence),
          type: "thinking",
          title: summarizeInline(detail) || (assistantEventType === "thinking_end" ? "推理完成" : "推理中…"),
          detail,
          status: assistantEventType === "thinking_end" ? "done" : "running",
          timestamp,
          raw: sanitizeForClient(event)
        };
        if (!previous) {
          thinkingBySequence.set(sequence, nextItem);
          add(nextItem);
        } else {
          Object.assign(previous, nextItem);
        }
        if (assistantEventType === "thinking_end") {
          thinkingState.activeSequenceByContentIndex.delete(contentIndex);
        }
      }
      if (assistantEventType === "toolcall_end" && isRecord(assistantEvent?.toolCall)) {
        upsertToolTrace(toolById, trace, seen, {
          id: readString(assistantEvent.toolCall.id) ?? `${index}-toolcall-end`,
          name: readString(assistantEvent.toolCall.name) ?? "tool",
          args: assistantEvent.toolCall.arguments,
          status: "running",
          timestamp,
          raw: event
        });
      }
      extractMessageTrace(event.message, `${index}-message-update`, timestamp, add, { includeThinking: false, includeText: false });
      return;
    }

    if (eventType === "message_start" || eventType === "message_end") {
      extractMessageTrace(event.message, `${index}-${eventType}`, timestamp, add, {
        includeThinking: false,
        toolById,
        trace,
        seen
      });
      return;
    }

    if (eventType === "tool_execution_start") {
      const toolName = readString(event.toolName) ?? "tool";
      upsertToolTrace(toolById, trace, seen, {
        id: readString(event.toolCallId) ?? `${index}-tool-start`,
        name: toolName,
        args: event.args,
        status: "running",
        timestamp,
        raw: event
      });
      return;
    }

    if (eventType === "tool_execution_update") {
      const toolName = readString(event.toolName) ?? "tool";
      upsertToolTrace(toolById, trace, seen, {
        id: readString(event.toolCallId) ?? `${index}-tool-update`,
        name: toolName,
        update: event.partialResult,
        status: "running",
        timestamp,
        raw: event
      });
      return;
    }

    if (eventType === "tool_execution_end") {
      const toolName = readString(event.toolName) ?? "tool";
      upsertToolTrace(toolById, trace, seen, {
        id: readString(event.toolCallId) ?? `${index}-tool-end`,
        name: toolName,
        result: event.result,
        status: event.isError === true ? "error" : "done",
        timestamp,
        raw: event
      });
      return;
    }

    if (eventType === "tool_call") {
      const toolName = readString(event.toolName) ?? "tool";
      upsertToolTrace(toolById, trace, seen, {
        id: readString(event.toolCallId) ?? `${index}-tool-call`,
        name: toolName,
        args: event.input,
        status: "running",
        timestamp,
        raw: event
      });
      return;
    }

    if (eventType === "tool_result") {
      const toolName = readString(event.toolName) ?? "tool";
      upsertToolTrace(toolById, trace, seen, {
        id: readString(event.toolCallId) ?? `${index}-tool-result`,
        name: toolName,
        result: event.content,
        status: event.isError === true ? "error" : "done",
        timestamp,
        raw: event
      });
      return;
    }

    if (eventType === "model_select") {
      const model = isRecord(event.model) ? readString(event.model.id) ?? readString(event.model.name) : undefined;
      add({ id: `${index}-model`, type: "status", title: model ? `选择模型：${model}` : "选择模型", status: "done", timestamp, raw: sanitizeForClient(event) });
    }
  });

  return compactTrace(trace);
}

function extractMessageTrace(
  message: unknown,
  idPrefix: string,
  timestamp: string | undefined,
  add: (item: AgentTraceItem) => void,
  options: { includeThinking?: boolean; includeText?: boolean; toolById?: Map<string, ToolTraceAggregate>; trace?: AgentTraceItem[]; seen?: Set<string> } = {}
) {
  if (!isRecord(message)) return;
  const includeThinking = options.includeThinking ?? true;
  const includeText = options.includeText ?? true;
  if (message.role === "assistant" && Array.isArray(message.content)) {
    message.content.forEach((block, index) => {
      if (!isRecord(block)) return;
      if (includeThinking && block.type === "thinking") {
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
      if (includeText && block.type === "text" && typeof block.text === "string") {
        add({
          id: `${idPrefix}-text-${index}`,
          type: "message",
          title: block.text,
          status: "done",
          timestamp,
          raw: sanitizeForClient(block)
        });
      }
      if (block.type === "toolCall") {
        if (options.toolById && options.trace && options.seen) {
          upsertToolTrace(options.toolById, options.trace, options.seen, {
            id: readString(block.id) ?? readString(block.toolCallId) ?? `${idPrefix}-tool-${index}`,
            name: readString(block.name) ?? readString(block.toolName) ?? "tool",
            args: block.arguments ?? block.input,
            status: "running",
            timestamp,
            raw: block
          });
        } else {
          addToolCall(block, `${idPrefix}-tool-${index}`, timestamp, block, add);
        }
      }
    });
  }

  if (message.role === "toolResult") {
    const toolName = readString(message.toolName) ?? "tool";
    if (options.toolById && options.trace && options.seen) {
      upsertToolTrace(options.toolById, options.trace, options.seen, {
        id: readString(message.toolCallId) ?? `${idPrefix}-message-result`,
        name: toolName,
        message: message.content,
        status: message.isError === true ? "error" : "done",
        timestamp,
        raw: message
      });
    } else {
      add({
        id: readString(message.toolCallId) ?? `${idPrefix}-message-result`,
        type: "tool_result",
        title: `工具消息：${toolName}`,
        detail: buildToolTraceDetail(undefined, [], undefined, message.content),
        status: message.isError === true ? "error" : "done",
        timestamp,
        raw: sanitizeForClient(message)
      });
    }
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

function upsertToolTrace(
  toolById: Map<string, ToolTraceAggregate>,
  trace: AgentTraceItem[],
  seen: Set<string>,
  input: {
    id: string;
    name: string;
    args?: unknown;
    update?: unknown;
    result?: unknown;
    message?: unknown;
    status?: AgentTraceItem["status"];
    timestamp?: string;
    raw?: unknown;
  }
) {
  const key = `tool_call:${input.id}`;
  let aggregate = toolById.get(input.id);
  if (!aggregate) {
    aggregate = {
      item: {
        id: input.id,
        type: "tool_call",
        title: `工具调用：${input.name}`,
        status: input.status ?? "running",
        timestamp: input.timestamp,
        raw: input.raw === undefined ? undefined : sanitizeForClient(input.raw)
      },
      updates: []
    };
    toolById.set(input.id, aggregate);
    if (!seen.has(key)) {
      seen.add(key);
      trace.push(aggregate.item);
    }
  }

  if (input.args !== undefined && (!hasUsefulToolPayload(aggregate.args) || hasUsefulToolPayload(input.args))) aggregate.args = input.args;
  if (input.update !== undefined) aggregate.updates.push(input.update);
  if (input.result !== undefined) aggregate.result = input.result;
  if (input.message !== undefined) aggregate.message = input.message;

  aggregate.item.title = buildToolTraceTitle(input.name, input.status ?? aggregate.item.status);
  aggregate.item.detail = buildToolTraceDetail(aggregate.args, aggregate.updates, aggregate.result, aggregate.message);
  aggregate.item.status = input.status ?? aggregate.item.status;
  aggregate.item.timestamp = input.timestamp ?? aggregate.item.timestamp;
  aggregate.item.raw = undefined;
}

function buildToolTraceTitle(toolName: string, status: AgentTraceItem["status"] | undefined) {
  const suffix = status === "error" ? "失败" : status === "done" ? "完成" : "处理中";
  return `工具调用：${toolName} ${suffix}`;
}

function buildToolTraceDetail(args: unknown, updates: unknown[], result: unknown, message: unknown) {
  const parts: string[] = [];
  const argsText = stringifyDetail(args);
  if (argsText) parts.push(`参数\n${argsText}`);

  const updateTexts = updates.map((item) => stringifyDetail(item)).filter(Boolean);
  if (updateTexts.length) parts.push(`更新\n${updateTexts.join("\n\n")}`);

  const resultText = summarizeToolResult(result);
  if (resultText) parts.push(`返回\n${resultText}`);

  const messageText = summarizeToolResult(message);
  if (messageText) parts.push(`工具消息\n${messageText}`);

  return parts.join("\n\n");
}

function hasUsefulToolPayload(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
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

function compactTrace(trace: AgentTraceItem[]) {
  const output: AgentTraceItem[] = [];
  const byKey = new Map<string, AgentTraceItem>();
  for (const item of trace) {
    const key = `${item.type}:${item.id}`;
    const existing = byKey.get(key);
    if (existing) {
      Object.assign(existing, item);
      continue;
    }
    byKey.set(key, item);
    output.push(item);
  }
  return output;
}

function getActiveThinkingSequence(contentIndex: number, state: ThinkingState) {
  const active = state.activeSequenceByContentIndex.get(contentIndex);
  if (active !== undefined) return active;
  const sequence = state.nextSequence++;
  state.activeSequenceByContentIndex.set(contentIndex, sequence);
  state.buffersBySequence.set(sequence, "");
  return sequence;
}

function thinkingTraceId(contentIndex: number, sequence: number) {
  return `thinking-${sequence}-${contentIndex}`;
}

function summarizeInline(value: string | undefined) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
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
