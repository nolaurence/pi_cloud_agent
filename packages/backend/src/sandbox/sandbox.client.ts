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

  private extractMessage(data: unknown) {
    if (typeof data === "string") return data;
    if (!data || typeof data !== "object" || !("message" in data)) return undefined;
    const message = (data as { message?: unknown }).message;
    return Array.isArray(message) ? message.join(", ") : typeof message === "string" ? message : undefined;
  }
}
