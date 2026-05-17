import type { AgentSessionSummary, AgentTraceItem, BrowserConnectionStatus, ChatMessage, CreateScheduledTaskInput, InstalledSkillSummary, ModelCredentialProvider, ModelCredentialStatus, PromptResponse, ScheduledTaskRunSummary, ScheduledTaskSummary, SetModelCredentialInput, UpdateScheduledTaskInput } from "@pi-cloud/shared";

const API_BASE = "/api";

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; displayName: string; role: string };
}

export class ApiClient {
  constructor(private token?: string) {}

  setToken(token?: string) {
    this.token = token;
  }

  register(input: { email: string; displayName: string; password: string }) {
    return this.request<AuthResponse>("/auth/register", { method: "POST", body: input });
  }

  login(input: { email: string; password: string }) {
    return this.request<AuthResponse>("/auth/login", { method: "POST", body: input });
  }

  me() {
    return this.request<AuthResponse["user"]>("/auth/me");
  }

  listSessions() {
    return this.request<AgentSessionSummary[]>("/sessions");
  }

  createSession(input: { title?: string; provider?: string; model?: string }) {
    return this.request<AgentSessionSummary>("/sessions", { method: "POST", body: input });
  }

  listMessages(sessionId: string) {
    return this.request<ChatMessage[]>(`/sessions/${sessionId}/messages`);
  }

  prompt(sessionId: string, message: string) {
    return this.request<PromptResponse>(`/sessions/${sessionId}/messages`, { method: "POST", body: { message } });
  }

  async promptStream(
    sessionId: string,
    message: string,
    callbacks: {
      onTrace: (item: AgentTraceItem) => void;
      onComplete: (result: { assistantText: string; assistantTrace: AgentTraceItem[]; eventCount: number }) => void;
      onError: (error: Error) => void;
    }
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/messages/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      const text = await response.text();
      callbacks.onError(new Error(text || `HTTP ${response.status}`));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError(new Error("No response body"));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === "trace" && data.item) {
              callbacks.onTrace(data.item as AgentTraceItem);
            } else if (data.type === "done") {
              callbacks.onComplete({
                assistantText: data.assistantText ?? "",
                assistantTrace: data.assistantTrace ?? [],
                eventCount: data.eventCount ?? 0
              });
            } else if (data.type === "error") {
              callbacks.onError(new Error(data.message ?? "Unknown error"));
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  browserStatus() {
    return this.request<BrowserConnectionStatus>("/browser-connections/status");
  }

  connectExtension(input: { token: string; cdpEndpoint?: string }) {
    return this.request<BrowserConnectionStatus>("/browser-connections/extension", { method: "POST", body: input });
  }

  useSandboxCdp() {
    return this.request<BrowserConnectionStatus>("/browser-connections/sandbox-cdp", { method: "POST", body: {} });
  }

  modelCredentials() {
    return this.request<ModelCredentialStatus[]>("/model-credentials");
  }

  setModelCredential(provider: ModelCredentialProvider, input: SetModelCredentialInput) {
    return this.request<ModelCredentialStatus[]>(`/model-credentials/${provider}`, { method: "PUT", body: input });
  }

  removeModelCredential(provider: ModelCredentialProvider) {
    return this.request<ModelCredentialStatus[]>(`/model-credentials/${provider}`, { method: "DELETE" });
  }

  listScheduledTasks() {
    return this.request<ScheduledTaskSummary[]>("/scheduled-tasks");
  }

  createScheduledTask(input: CreateScheduledTaskInput) {
    return this.request<ScheduledTaskSummary>("/scheduled-tasks", { method: "POST", body: input });
  }

  updateScheduledTask(taskId: string, input: UpdateScheduledTaskInput) {
    return this.request<ScheduledTaskSummary>(`/scheduled-tasks/${taskId}`, { method: "PATCH", body: input });
  }

  removeScheduledTask(taskId: string) {
    return this.request<{ ok: true }>(`/scheduled-tasks/${taskId}`, { method: "DELETE" });
  }

  runScheduledTask(taskId: string) {
    return this.request<ScheduledTaskRunSummary>(`/scheduled-tasks/${taskId}/run`, { method: "POST", body: {} });
  }

  listScheduledTaskRuns() {
    return this.request<ScheduledTaskRunSummary[]>("/scheduled-tasks/runs");
  }

  listSkills() {
    return this.request<InstalledSkillSummary[]>("/skills");
  }

  installSkill(input: { fileName: string; contentBase64: string }) {
    return this.request<InstalledSkillSummary[]>("/skills/install", { method: "PUT", body: input });
  }

  setSkillEnabled(skillId: string, enabled: boolean) {
    return this.request<InstalledSkillSummary[]>(`/skills/${skillId}/enabled`, { method: "PUT", body: { enabled } });
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return response.json() as Promise<T>;
  }
}
