import { Injectable } from "@nestjs/common";
import type { ModelCredentialProvider, ModelCredentialStatus } from "@pi-cloud/shared";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WorkspaceService } from "../workspace/workspace.service";

const PROVIDERS: Array<{ provider: ModelCredentialProvider; label: string }> = [
  { provider: "openai", label: "OpenAI" },
  { provider: "anthropic", label: "Anthropic" },
  { provider: "google", label: "Google Gemini" },
  { provider: "deepseek", label: "DeepSeek" },
  { provider: "openrouter", label: "OpenRouter" },
  { provider: "xai", label: "xAI" },
  { provider: "groq", label: "Groq" },
  { provider: "mistral", label: "Mistral" }
];

type AuthFile = Record<string, { type?: string; key?: string } | undefined>;

@Injectable()
export class ModelCredentialsService {
  constructor(private readonly workspace: WorkspaceService) {}

  async list(userId: string): Promise<ModelCredentialStatus[]> {
    const { authPath } = await this.resolveAuthPath(userId);
    const auth = await this.readAuth(authPath);
    const updatedAt = await stat(authPath).then((item) => item.mtime.toISOString()).catch(() => undefined);
    return PROVIDERS.map((item) => ({
      ...item,
      configured: auth[item.provider]?.type === "api_key" && Boolean(auth[item.provider]?.key),
      updatedAt: auth[item.provider] ? updatedAt : undefined
    }));
  }

  async set(userId: string, provider: ModelCredentialProvider, apiKey: string) {
    const { authPath } = await this.resolveAuthPath(userId);
    const auth = await this.readAuth(authPath);
    auth[provider] = { type: "api_key", key: apiKey };
    await this.writeAuth(authPath, auth);
    return this.list(userId);
  }

  async remove(userId: string, provider: ModelCredentialProvider) {
    const { authPath } = await this.resolveAuthPath(userId);
    const auth = await this.readAuth(authPath);
    delete auth[provider];
    await this.writeAuth(authPath, auth);
    return this.list(userId);
  }

  private async resolveAuthPath(userId: string) {
    const { agentDir } = await this.workspace.ensureUserWorkspace(userId);
    return { authPath: join(agentDir, "auth.json") };
  }

  private async readAuth(authPath: string): Promise<AuthFile> {
    return readFile(authPath, "utf8")
      .then((text) => JSON.parse(text) as AuthFile)
      .catch(() => ({}));
  }

  private async writeAuth(authPath: string, auth: AuthFile) {
    await writeFile(authPath, JSON.stringify(auth, null, 2), "utf8");
    await chmod(authPath, 0o600);
  }
}
