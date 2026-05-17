import { Injectable } from "@nestjs/common";
import type { InstalledSkillSummary } from "@pi-cloud/shared";
import { SandboxClient } from "../sandbox/sandbox.client";

@Injectable()
export class SkillsService {
  constructor(private readonly sandbox: SandboxClient) {}

  list(userId: string) {
    return this.sandbox.get<InstalledSkillSummary[]>(`/skills/${userId}`);
  }

  install(userId: string, input: { fileName: string; contentBase64: string }) {
    return this.sandbox.put<InstalledSkillSummary[]>(`/skills/${userId}/install`, input);
  }

  setEnabled(userId: string, skillId: string, enabled: boolean) {
    return this.sandbox.put<InstalledSkillSummary[]>(`/skills/${userId}/${skillId}/enabled`, { enabled });
  }
}
