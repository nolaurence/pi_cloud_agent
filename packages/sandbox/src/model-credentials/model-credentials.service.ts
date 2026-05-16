import { BadRequestException, Injectable } from "@nestjs/common";
import type { ModelCredentialProvider, ModelCredentialStatus, SetModelCredentialInput } from "@pi-cloud/shared";
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
  { provider: "mistral", label: "Mistral" },
  { provider: "siliconflow", label: "SiliconFlow" }
];

type AuthFile = Record<string, { type?: string; key?: string } | undefined>;
type ModelsFile = {
  providers?: Record<string, {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    api?: string;
    authHeader?: boolean;
    compat?: Record<string, unknown>;
    models?: Array<Record<string, unknown> & { id: string; name?: string }>;
  }>;
};

const SILICONFLOW_PROVIDER = "siliconflow" satisfies ModelCredentialProvider;
const SILICONFLOW_DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";

@Injectable()
export class ModelCredentialsService {
  constructor(private readonly workspace: WorkspaceService) {}

  async list(userId: string): Promise<ModelCredentialStatus[]> {
    const { authPath, modelsPath } = await this.resolvePaths(userId);
    const auth = await this.readAuth(authPath);
    const models = await this.readModels(modelsPath);
    const updatedAt = await stat(authPath).then((item) => item.mtime.toISOString()).catch(() => undefined);
    return PROVIDERS.map((item) => ({
      ...item,
      configured: auth[item.provider]?.type === "api_key" && Boolean(auth[item.provider]?.key),
      baseUrl: item.provider === SILICONFLOW_PROVIDER ? models.providers?.[SILICONFLOW_PROVIDER]?.baseUrl : undefined,
      model: item.provider === SILICONFLOW_PROVIDER ? models.providers?.[SILICONFLOW_PROVIDER]?.models?.[0]?.id : undefined,
      updatedAt: auth[item.provider] ? updatedAt : undefined
    }));
  }

  async set(userId: string, provider: ModelCredentialProvider, input: SetModelCredentialInput) {
    const { authPath, modelsPath } = await this.resolvePaths(userId);
    if (provider === SILICONFLOW_PROVIDER && !input.model?.trim()) {
      throw new BadRequestException("SiliconFlow model is required");
    }
    const auth = await this.readAuth(authPath);
    auth[provider] = { type: "api_key", key: input.apiKey };
    await this.writeAuth(authPath, auth);
    if (provider === SILICONFLOW_PROVIDER) {
      await this.writeSiliconFlowModels(modelsPath, input);
    }
    return this.list(userId);
  }

  async remove(userId: string, provider: ModelCredentialProvider) {
    const { authPath, modelsPath } = await this.resolvePaths(userId);
    const auth = await this.readAuth(authPath);
    delete auth[provider];
    await this.writeAuth(authPath, auth);
    if (provider === SILICONFLOW_PROVIDER) {
      await this.removeSiliconFlowModels(modelsPath);
    }
    return this.list(userId);
  }

  private async resolvePaths(userId: string) {
    const { agentDir } = await this.workspace.ensureUserWorkspace(userId);
    return { authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json") };
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

  private async readModels(modelsPath: string): Promise<ModelsFile> {
    return readFile(modelsPath, "utf8")
      .then((text) => JSON.parse(text) as ModelsFile)
      .catch(() => ({}));
  }

  private async writeSiliconFlowModels(modelsPath: string, input: SetModelCredentialInput) {
    const models = await this.readModels(modelsPath);
    const baseUrl = input.baseUrl?.trim() || SILICONFLOW_DEFAULT_BASE_URL;
    const model = input.model?.trim();
    if (!model) return;

    models.providers = {
      ...models.providers,
      [SILICONFLOW_PROVIDER]: {
        name: "SiliconFlow",
        baseUrl,
        api: "openai-completions",
        apiKey: "SILICONFLOW_API_KEY",
        authHeader: true,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: true,
          thinkingFormat: "deepseek"
        },
        models: [
          {
            id: model,
            name: model,
            input: ["text"],
            contextWindow: 128000,
            maxTokens: 16384,
            reasoning: true
          }
        ]
      }
    };

    await this.writeModels(modelsPath, models);
  }

  private async removeSiliconFlowModels(modelsPath: string) {
    const models = await this.readModels(modelsPath);
    if (!models.providers?.[SILICONFLOW_PROVIDER]) return;
    delete models.providers[SILICONFLOW_PROVIDER];
    if (Object.keys(models.providers).length === 0) delete models.providers;
    await this.writeModels(modelsPath, models);
  }

  private async writeModels(modelsPath: string, models: ModelsFile) {
    await writeFile(modelsPath, JSON.stringify(models, null, 2), "utf8");
    await chmod(modelsPath, 0o600);
  }
}
