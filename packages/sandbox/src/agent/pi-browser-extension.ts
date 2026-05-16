import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface BrowserCommandArgs {
  command: string;
  args?: string[];
}

const BLOCKED_COMMANDS = new Set(["tab-select"]);
const NAVIGATION_COMMANDS = new Set(["open", "goto"]);

export default function browserCliExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "browser_cli",
    label: "browser cli",
    description:
      "Run Playwright browser automation through sandbox-owned playwright-cli. Use tab-new to create pages. Existing tabs cannot be selected.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "playwright-cli command, for example tab-new, goto, snapshot, click, type, screenshot"
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Command arguments"
        }
      },
      required: ["command"],
      additionalProperties: false
    },
    async execute(_id, params, signal) {
      const input = params as BrowserCommandArgs;
      if (BLOCKED_COMMANDS.has(input.command)) {
        return {
          content: [
            {
              type: "text",
              text: "Blocked by policy: this cloud agent may create new tabs, but may not select or take over existing tabs."
            }
          ],
          details: undefined
        };
      }

      const env = {
        ...process.env,
        PLAYWRIGHT_CLI_SESSION: process.env.PI_CLOUD_BROWSER_SESSION ?? "pi-cloud-agent"
      };
      await attachConfiguredBrowser(env, signal);
      const command = normalizeNewTabOnlyCommand(input);
      const output = await runPlaywrightCli(command, env, signal);
      return { content: [{ type: "text", text: output }], details: undefined };
    }
  });
}

async function attachConfiguredBrowser(env: NodeJS.ProcessEnv, signal?: AbortSignal) {
  const configPath = process.env.PI_CLOUD_BROWSER_CONFIG;
  if (!configPath) return;

  const config = await readFile(configPath, "utf8")
    .then((text) => JSON.parse(text) as { mode?: string; token?: string; cdpEndpoint?: string })
    .catch(() => undefined);

  if (!config) return;
  if (config.mode === "user-extension") {
    if (config.token) env.PLAYWRIGHT_EXTENSION_TOKEN = config.token;
    await runPlaywrightCli(["attach", "--extension=chrome"], env, signal).catch(() => undefined);
    return;
  }
  if (config.cdpEndpoint) {
    await runPlaywrightCli(["attach", `--cdp=${config.cdpEndpoint}`], env, signal).catch(() => undefined);
  }
}

function normalizeNewTabOnlyCommand(input: BrowserCommandArgs) {
  if (NAVIGATION_COMMANDS.has(input.command)) {
    return ["tab-new", ...(input.args ?? [])];
  }
  return [input.command, ...(input.args ?? [])];
}

function runPlaywrightCli(args: string[], env: NodeJS.ProcessEnv, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("npx", ["playwright-cli", ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(output || `playwright-cli exited with code ${code}`));
        return;
      }
      resolve(output.trim() || "ok");
    });
  });
}
