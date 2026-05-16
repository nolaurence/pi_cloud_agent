import { Injectable } from "@nestjs/common";
import type { ModelCredentialProvider, ModelCredentialStatus, SetModelCredentialInput } from "@pi-cloud/shared";
import { SandboxClient } from "../sandbox/sandbox.client";

@Injectable()
export class ModelCredentialsService {
  constructor(private readonly sandbox: SandboxClient) {}

  list(userId: string) {
    return this.sandbox.get<ModelCredentialStatus[]>(`/model-credentials/${userId}`);
  }

  set(userId: string, provider: ModelCredentialProvider, input: SetModelCredentialInput) {
    return this.sandbox.put<ModelCredentialStatus[]>(`/model-credentials/${userId}/${provider}`, input);
  }

  remove(userId: string, provider: ModelCredentialProvider) {
    return this.sandbox.delete<ModelCredentialStatus[]>(`/model-credentials/${userId}/${provider}`);
  }
}
