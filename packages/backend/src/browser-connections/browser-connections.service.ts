import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { BrowserConnectionStatus } from "@pi-cloud/shared";
import { Repository } from "typeorm";
import { SandboxClient } from "../sandbox/sandbox.client";
import { BrowserConnectionEntity } from "./browser-connection.entity";

@Injectable()
export class BrowserConnectionsService {
  constructor(
    @InjectRepository(BrowserConnectionEntity) private readonly connections: Repository<BrowserConnectionEntity>,
    private readonly sandbox: SandboxClient
  ) {}

  async status(userId: string): Promise<BrowserConnectionStatus> {
    const connection = await this.connections.findOne({ where: { userId }, order: { updatedAt: "DESC" } });
    if (!connection) {
      return { mode: "sandbox-cdp", status: "disconnected", newTabOnly: true };
    }
    return {
      id: connection.id,
      mode: connection.mode,
      status: connection.status,
      newTabOnly: true,
      lastError: connection.lastError
    };
  }

  async connectExtension(userId: string, input: { token: string; cdpEndpoint?: string }) {
    const connection = await this.connections.save(
      this.connections.create({
        userId,
        mode: "user-extension",
        tokenCiphertext: Buffer.from(input.token, "utf8").toString("base64"),
        cdpEndpoint: input.cdpEndpoint,
        newTabOnly: true,
        status: "connecting"
      })
    );
    const result = await this.sandbox.post<BrowserConnectionStatus>("/browser/extension", {
      userId,
      token: input.token,
      cdpEndpoint: input.cdpEndpoint,
      newTabOnly: true
    });
    connection.status = result.status;
    connection.lastError = result.lastError;
    await this.connections.save(connection);
    return { ...result, id: connection.id };
  }

  async useSandboxCdp(userId: string) {
    const result = await this.sandbox.post<BrowserConnectionStatus>("/browser/sandbox-cdp", { userId, newTabOnly: true });
    const connection = await this.connections.save(
      this.connections.create({
        userId,
        mode: "sandbox-cdp",
        status: result.status,
        cdpEndpoint: "sandbox",
        newTabOnly: true,
        lastError: result.lastError
      })
    );
    return { ...result, id: connection.id };
  }
}
