import { Injectable } from "@nestjs/common";
import type { BrowserConnectionStatus } from "@pi-cloud/shared";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { WorkspaceService } from "../workspace/workspace.service";

@Injectable()
export class BrowserConnectionService {
  constructor(private readonly workspace: WorkspaceService) {}

  async connectUserExtension(input: { userId: string; token: string; cdpEndpoint?: string }): Promise<BrowserConnectionStatus> {
    const { browserConfigPath } = await this.workspace.ensureUserWorkspace(input.userId);
    if (!input.token.trim()) {
      return { mode: "user-extension", status: "error", newTabOnly: true, lastError: "Missing Playwright extension token" };
    }
    await writeFile(
      browserConfigPath,
      JSON.stringify(
        {
          mode: "user-extension",
          token: input.token,
          cdpEndpoint: input.cdpEndpoint,
          newTabOnly: true
        },
        null,
        2
      )
    );

    return {
      mode: "user-extension",
      status: "connected",
      newTabOnly: true
    };
  }

  async useSandboxCdp(userId: string): Promise<BrowserConnectionStatus> {
    const { baseDir, browserConfigPath } = await this.workspace.ensureUserWorkspace(userId);
    const cdpPort = 9300 + Math.abs(this.hashCode(userId) % 500);
    const browser = spawn(
      "npx",
      [
        "playwright",
        "chromium",
        "--user-data-dir",
        `${baseDir}/chromium-profile`,
        "--remote-debugging-port",
        String(cdpPort),
        "about:blank"
      ],
      { detached: true, stdio: "ignore" }
    );
    browser.unref();
    await writeFile(
      browserConfigPath,
      JSON.stringify(
        {
          mode: "sandbox-cdp",
          cdpEndpoint: `http://127.0.0.1:${cdpPort}`,
          newTabOnly: true
        },
        null,
        2
      )
    );

    return {
      mode: "sandbox-cdp",
      status: "connected",
      newTabOnly: true
    };
  }

  buildPlaywrightMcpCommand(cdpEndpoint: string, token?: string) {
    const envPart = token ? `PLAYWRIGHT_EXTENSION_TOKEN=${token} ` : "";
    return `${envPart}npx @playwright/mcp@latest --cdp-endpoint=${JSON.stringify(cdpEndpoint)}`;
  }

  buildPlaywrightCliAttachCommand(cdpTarget: string, token?: string) {
    const envPart = token ? `PLAYWRIGHT_MCP_EXTENSION=1 PLAYWRIGHT_EXTENSION_TOKEN=${token} ` : "";
    return token ? `${envPart}npx playwright-cli attach --extension=chrome` : `npx playwright-cli attach --cdp=${JSON.stringify(cdpTarget)}`;
  }

  private hashCode(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }
    return hash;
  }
}
