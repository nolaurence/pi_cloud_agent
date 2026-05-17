import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { InstalledSkillSummary } from "@pi-cloud/shared";
import extract from "extract-zip";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { WorkspaceService } from "../workspace/workspace.service";

interface SkillManifest {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  sourceDir: string;
}

@Injectable()
export class SkillsService {
  constructor(private readonly workspace: WorkspaceService) {}

  async list(userId: string): Promise<InstalledSkillSummary[]> {
    const { installedSkillsDir } = await this.ensureDirs(userId);
    const index = await this.readIndex(installedSkillsDir);
    return index.map(toSummary);
  }

  async install(userId: string, input: { fileName: string; contentBase64: string }): Promise<InstalledSkillSummary[]> {
    if (!input.fileName.toLowerCase().endsWith(".zip")) throw new BadRequestException("Only zip skill packages are supported");
    const { installedSkillsDir, tempDir } = await this.ensureDirs(userId);
    const id = slugify(input.fileName.replace(/\.zip$/i, "")) || randomUUID();
    const targetDir = join(installedSkillsDir, id);
    const extractDir = join(targetDir, "source");
    const zipPath = join(tempDir, `${id}-${Date.now()}.zip`);
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await writeFile(zipPath, Buffer.from(input.contentBase64, "base64"));
    await extract(zipPath, { dir: extractDir });
    await rm(zipPath, { force: true });

    const rootDir = await resolveSkillRoot(extractDir);
    const metadata = await readSkillMetadata(rootDir, input.fileName);
    const now = new Date().toISOString();
    const index = (await this.readIndex(installedSkillsDir)).filter((item) => item.id !== id);
    index.push({
      id,
      name: metadata.name,
      description: metadata.description,
      enabled: true,
      installedAt: now,
      updatedAt: now,
      sourceDir: rootDir
    });
    await this.writeIndex(installedSkillsDir, index);
    await this.syncEnabledSkill(userId, index[index.length - 1]);
    return index.map(toSummary);
  }

  async setEnabled(userId: string, skillId: string, enabled: boolean): Promise<InstalledSkillSummary[]> {
    const { installedSkillsDir } = await this.ensureDirs(userId);
    const index = await this.readIndex(installedSkillsDir);
    const skill = index.find((item) => item.id === skillId);
    if (!skill) throw new NotFoundException("Skill not found");
    skill.enabled = enabled;
    skill.updatedAt = new Date().toISOString();
    if (enabled) {
      await this.syncEnabledSkill(userId, skill);
    } else {
      await this.removeEnabledSkill(userId, skill);
    }
    await this.writeIndex(installedSkillsDir, index);
    return index.map(toSummary);
  }

  private async ensureDirs(userId: string) {
    const workspace = await this.workspace.ensureUserWorkspace(userId);
    const installedSkillsDir = join(workspace.agentDir, "installed-skills");
    const tempDir = join(workspace.baseDir, "tmp");
    await mkdir(installedSkillsDir, { recursive: true });
    await mkdir(tempDir, { recursive: true });
    return { ...workspace, installedSkillsDir, tempDir };
  }

  private async readIndex(installedSkillsDir: string): Promise<SkillManifest[]> {
    return readFile(join(installedSkillsDir, "index.json"), "utf8")
      .then((content) => {
        const parsed = JSON.parse(content) as SkillManifest[];
        return Array.isArray(parsed) ? parsed : [];
      })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
  }

  private async writeIndex(installedSkillsDir: string, index: SkillManifest[]) {
    await writeFile(join(installedSkillsDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
  }

  private async syncEnabledSkill(userId: string, skill: SkillManifest) {
    const { skillsDir } = await this.workspace.ensureUserWorkspace(userId);
    const target = join(skillsDir, skill.id);
    await rm(target, { recursive: true, force: true });
    await cp(skill.sourceDir, target, { recursive: true });
  }

  private async removeEnabledSkill(userId: string, skill: SkillManifest) {
    const { skillsDir } = await this.workspace.ensureUserWorkspace(userId);
    await rm(join(skillsDir, skill.id), { recursive: true, force: true });
  }
}

async function resolveSkillRoot(extractDir: string) {
  const skillMd = await findSkillMd(extractDir, 0);
  if (!skillMd) throw new BadRequestException("Skill package must contain a SKILL.md file");
  return resolve(skillMd, "..");
}

async function findSkillMd(dir: string, depth: number): Promise<string | undefined> {
  if (depth > 2) return undefined;
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) return join(dir, "SKILL.md");
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findSkillMd(join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function readSkillMetadata(rootDir: string, fileName: string) {
  const content = await readFile(join(rootDir, "SKILL.md"), "utf8");
  const frontMatter = content.match(/^---\n([\s\S]*?)\n---/);
  const meta = frontMatter?.[1] ?? "";
  const name = readYamlString(meta, "name") ?? basename(fileName, ".zip");
  const description = readYamlString(meta, "description") ?? content.split("\n").find((line) => line.trim() && !line.startsWith("---"))?.replace(/^#+\s*/, "");
  await stat(rootDir);
  return { name, description };
}

function readYamlString(source: string, key: string) {
  const match = source.match(new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, "m"));
  return match?.[1]?.trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function toSummary(skill: SkillManifest): InstalledSkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    installedAt: skill.installedAt,
    updatedAt: skill.updatedAt
  };
}
