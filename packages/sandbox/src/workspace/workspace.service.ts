import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

@Injectable()
export class WorkspaceService {
  private readonly root = resolve(process.env.SANDBOX_DATA_DIR ?? "data/sandbox");

  async ensureUserWorkspace(userId: string) {
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const baseDir = join(this.root, "users", safeUserId);
    const workspaceDir = join(baseDir, "workspace");
    const agentDir = join(baseDir, "pi-agent");
    const skillsDir = join(agentDir, "skills");
    const sessionsDir = join(agentDir, "sessions");
    const browserConfigPath = join(baseDir, "browser-connection.json");
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(skillsDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    await this.ensureSandboxReadme(workspaceDir);
    return { baseDir, workspaceDir, agentDir, skillsDir, browserConfigPath };
  }

  private async ensureSandboxReadme(workspaceDir: string) {
    await writeFile(
      join(workspaceDir, "README.md"),
      "# User workspace\n\nThis directory is isolated for one cloud-agent user. Pi file tools and shell tools run here through the sandbox service.\n",
      { flag: "wx" }
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
}
