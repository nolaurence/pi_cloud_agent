import type { AgentSessionSummary, BrowserConnectionStatus, ChatMessage, ModelCredentialProvider, ModelCredentialStatus, PromptResponse, SetModelCredentialInput } from "@pi-cloud/shared";

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
