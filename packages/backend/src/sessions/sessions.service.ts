import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AgentSessionSummary, PromptResponse } from "@pi-cloud/shared";
import { Repository } from "typeorm";
import { SandboxClient } from "../sandbox/sandbox.client";
import { AgentMessageEntity } from "./agent-message.entity";
import { AgentSessionEntity } from "./agent-session.entity";

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(AgentSessionEntity) private readonly sessions: Repository<AgentSessionEntity>,
    @InjectRepository(AgentMessageEntity) private readonly messagesRepo: Repository<AgentMessageEntity>,
    private readonly sandbox: SandboxClient
  ) {}

  async list(userId: string): Promise<AgentSessionSummary[]> {
    const sessions = await this.sessions.find({ where: { userId }, order: { updatedAt: "DESC" } });
    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      provider: session.provider,
      model: session.model,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString()
    }));
  }

  async create(userId: string, input: { title?: string; provider?: string; model?: string }) {
    const session = await this.sessions.save(
      this.sessions.create({
        userId,
        title: input.title ?? "Untitled session",
        provider: input.provider,
        model: input.model,
        status: "idle"
      })
    );

    const sandboxSession = await this.sandbox.post<{ id: string }>("/agent/sessions", {
      userId,
      sessionId: session.id,
      provider: input.provider,
      model: input.model
    });

    session.sandboxSessionId = sandboxSession.id;
    await this.sessions.save(session);
    return session;
  }

  async messages(userId: string, sessionId: string) {
    await this.requireOwnedSession(userId, sessionId);
    return this.messagesRepo.find({ where: { sessionId }, order: { createdAt: "ASC" } });
  }

  async prompt(userId: string, sessionId: string, message: string): Promise<PromptResponse> {
    const session = await this.requireOwnedSession(userId, sessionId);
    await this.messagesRepo.save(this.messagesRepo.create({ sessionId, role: "user", content: message }));

    session.status = "running";
    await this.sessions.save(session);

    try {
      const response = await this.sandbox.post<PromptResponse>(`/agent/sessions/${sessionId}/prompt`, {
        userId,
        message,
        provider: session.provider,
        model: session.model
      });

      if (response.assistantText) {
        await this.messagesRepo.save(
          this.messagesRepo.create({ sessionId, role: "assistant", content: response.assistantText, metadata: { eventCount: response.events.length } })
        );
      }
      session.status = "idle";
      await this.sessions.save(session);
      return response;
    } catch (error) {
      session.status = "failed";
      await this.sessions.save(session);
      throw error;
    }
  }

  private async requireOwnedSession(userId: string, sessionId: string) {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (session.userId !== userId) throw new ForbiddenException("Session belongs to another user");
    return session;
  }
}
