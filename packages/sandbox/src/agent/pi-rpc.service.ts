import { Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import type { PromptResponse } from "@pi-cloud/shared";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { WorkspaceService } from "../workspace/workspace.service";

type RpcEventListener = (event: unknown) => void;

interface RpcClientLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<{ model?: { provider?: string; id?: string } }>;
  promptAndWait(message: string, images?: unknown[], timeout?: number): Promise<unknown[]>;
  prompt(message: string, images?: unknown[]): Promise<void>;
  waitForIdle(timeout?: number): Promise<void>;
  onEvent(listener: RpcEventListener): () => void;
  getLastAssistantText(): Promise<string | null>;
  setThinkingLevel(level: string): Promise<void>;
}

interface SessionRuntime {
  id: string;
  sessionId: string;
  userId: string;
  client: RpcClientLike;
}

@Injectable()
export class PiRpcService implements OnModuleDestroy {
  private readonly sessions = new Map<string, SessionRuntime>();

  constructor(private readonly workspace: WorkspaceService) {}

  async createSession(input: { userId: string; sessionId: string; provider?: string; model?: string }) {
    const existing = this.sessions.get(input.sessionId);
    if (existing) return { id: existing.id };

    const runtime = await this.startRuntime(input);
    this.sessions.set(input.sessionId, runtime);
    return { id: runtime.id };
  }

  async prompt(input: { userId: string; sessionId: string; message: string; provider?: string; model?: string }): Promise<PromptResponse> {
    const runtime = await this.ensureRuntime(input);
    await this.assertUsableModel(runtime.client);

    const events = await runtime.client.promptAndWait(input.message, undefined, 180000);
    const assistantText = (await runtime.client.getLastAssistantText()) ?? "";
    return { sessionId: input.sessionId, events, assistantText };
  }

  /** Stream events in real-time via callbacks. Returns the final assistant text and all events. */
  async promptStreaming(
    input: { userId: string; sessionId: string; message: string; provider?: string; model?: string },
    callbacks: {
      onEvent: (event: unknown) => void;
      onComplete: (result: { assistantText: string; events: unknown[] }) => void;
      onError: (error: Error) => void;
    }
  ): Promise<void> {
    const runtime = await this.ensureRuntime(input);
    await this.assertUsableModel(runtime.client);

    const events: unknown[] = [];
    const unsubscribe = runtime.client.onEvent((event) => {
      events.push(event);
      try {
        callbacks.onEvent(event);
      } catch {
        // Don't let callback errors break the stream
      }
    });

    try {
      await runtime.client.prompt(input.message);
      await runtime.client.waitForIdle(180000);
      const assistantText = (await runtime.client.getLastAssistantText()) ?? "";
      unsubscribe();
      callbacks.onComplete({ assistantText, events });
    } catch (error) {
      unsubscribe();
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async ensureRuntime(input: { userId: string; sessionId: string; provider?: string; model?: string }): Promise<SessionRuntime> {
    let runtime = this.sessions.get(input.sessionId);
    if (!runtime) {
      runtime = await this.startRuntime(input);
      this.sessions.set(input.sessionId, runtime);
    }
    if (runtime.userId !== input.userId) {
      throw new Error("Cross-user sandbox session access denied");
    }
    // Ensure thinking is enabled on every prompt (in case runtime was cached before the fix)
    try {
      await runtime.client.setThinkingLevel("medium");
    } catch {
      // setThinkingLevel may not be supported by all pi versions or models
    }
    return runtime;
  }

  async onModuleDestroy() {
    await Promise.all([...this.sessions.values()].map((runtime) => runtime.client.stop().catch(() => undefined)));
  }

  private async startRuntime(input: { userId: string; sessionId: string; provider?: string; model?: string }): Promise<SessionRuntime> {
    const { workspaceDir, agentDir, browserConfigPath } = await this.workspace.ensureUserWorkspace(input.userId);
    const { RpcClient, cliPath } = await this.loadPiRpcClient();
    const browserExtensionPath = join(__dirname, "pi-browser-extension.js");
    const args = ["--session", join(agentDir, "sessions", `${input.sessionId}.jsonl`)];
    args.push("--extension", browserExtensionPath);

    const client = new RpcClient({
      cliPath,
      cwd: workspaceDir,
      env: {
        ...process.env,
        PI_CLOUD_BROWSER_CONFIG: browserConfigPath,
        PI_CLOUD_BROWSER_SESSION: `user-${input.userId}`,
        PI_CODING_AGENT_DIR: agentDir,
        PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions")
      },
      provider: input.provider,
      model: input.model,
      args
    }) as RpcClientLike;

    await client.start();
    // Enable thinking by default (medium level for good balance of quality vs speed)
    try {
      await client.setThinkingLevel("medium");
    } catch (error) {
      // setThinkingLevel may not be supported by all pi versions or models
      console.warn("Failed to set thinking level:", error instanceof Error ? error.message : String(error));
    }
    return { id: randomUUID(), userId: input.userId, sessionId: input.sessionId, client };
  }

  private async assertUsableModel(client: RpcClientLike) {
    const state = await client.getState();
    const provider = state.model?.provider;
    const model = state.model?.id;
    if (!provider || !model || provider === "unknown" || model === "unknown") {
      throw new ServiceUnavailableException(
        "No usable Pi model is configured. Add a provider API key or OAuth credential to the sandbox agent auth.json, or create sessions with an explicit configured provider/model."
      );
    }
  }

  private async loadPiRpcClient(): Promise<{ RpcClient: new (options: unknown) => RpcClientLike; cliPath: string }> {
    const require = createRequire(__filename);
    const packageRoot = require
      .resolve
      .paths("@earendil-works/pi-coding-agent")
      ?.map((searchPath) => join(searchPath, "@earendil-works", "pi-coding-agent"))
      .find((candidate) => existsSync(join(candidate, "package.json")));

    if (!packageRoot) {
      throw new Error("Unable to locate @earendil-works/pi-coding-agent package root");
    }

    const nativeImport = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
    const module = await nativeImport<{ RpcClient: new (options: unknown) => RpcClientLike }>("@earendil-works/pi-coding-agent");
    return { ...module, cliPath: join(packageRoot, "dist", "cli.js") };
  }
}
