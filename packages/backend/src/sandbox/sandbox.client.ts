import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { AxiosError } from "axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

@Injectable()
export class SandboxClient {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService
  ) {
    this.baseUrl = config.get("SANDBOX_URL") ?? "http://localhost:3001";
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.post<T>(`${this.baseUrl}${path}`, body));
      return response.data;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.put<T>(`${this.baseUrl}${path}`, body));
      return response.data;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  async get<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.get<T>(`${this.baseUrl}${path}`));
      return response.data;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  async delete<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.delete<T>(`${this.baseUrl}${path}`));
      return response.data;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown) {
    if (error instanceof AxiosError && error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const message = this.extractMessage(data) ?? error.message;
      return new HttpException({ message, statusCode: status }, status);
    }
    return new InternalServerErrorException(error instanceof Error ? error.message : "Sandbox request failed");
  }

  /** Stream SSE events from the sandbox. Resolves when the stream ends. */
  async postStream<T>(
    path: string,
    body: unknown,
    callbacks: {
      onData: (data: T) => void;
      onComplete: () => void;
      onError: (error: Error) => void;
    }
  ): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const text = await response.text();
        callbacks.onError(new Error(text || `Sandbox returned ${response.status}`));
        return;
      }

      const reader = (response.body as unknown as ReadableStream<Uint8Array> | null)?.getReader();
      if (!reader) {
        callbacks.onError(new Error("No response body from sandbox"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(trimmed.slice(6)) as T;
                callbacks.onData(parsed);
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
        callbacks.onComplete();
      } catch (error) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private extractMessage(data: unknown) {
    if (typeof data === "string") return data;
    if (!data || typeof data !== "object" || !("message" in data)) return undefined;
    const message = (data as { message?: unknown }).message;
    return Array.isArray(message) ? message.join(", ") : typeof message === "string" ? message : undefined;
  }
}
