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
}

export interface BrowserConnectionStatus {
  id?: string;
  mode: "sandbox-cdp" | "user-extension";
  status: "disconnected" | "connecting" | "connected" | "error";
  newTabOnly: true;
  lastError?: string;
}

export type ModelCredentialProvider = "openai" | "anthropic" | "google" | "deepseek" | "openrouter" | "xai" | "groq" | "mistral";

export interface ModelCredentialStatus {
  provider: ModelCredentialProvider;
  label: string;
  configured: boolean;
  updatedAt?: string;
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
}
