import { Injectable } from "@nestjs/common";
import type { ModelCredentialProvider, ModelCredentialStatus } from "@pi-cloud/shared";
import { SandboxClient } from "../sandbox/sandbox.client";

@Injectable()
export class ModelCredentialsService {
  constructor(private readonly sandbox: SandboxClient) {}

  list(userId: string) {
    return this.sandbox.get<ModelCredentialStatus[]>(`/model-credentials/${userId}`);
  }

  set(userId: string, provider: ModelCredentialProvider, apiKey: string) {
    return this.sandbox.put<ModelCredentialStatus[]>(`/model-credentials/${userId}/${provider}`, { apiKey });
  }

  remove(userId: string, provider: ModelCredentialProvider) {
    return this.sandbox.delete<ModelCredentialStatus[]>(`/model-credentials/${userId}/${provider}`);
  }
}
