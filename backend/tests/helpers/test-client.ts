import { AddressInfo } from "node:net";
import type { Express } from "express";

export interface TestResponse<T = any> {
  status: number;
  body: T;
}

export class TestClient {
  private baseUrl = "";
  private server?: ReturnType<Express["listen"]>;

  constructor(private readonly app: Express) {}

  async start() {
    this.server = this.app.listen(0);
    await new Promise<void>((resolve) => this.server!.once("listening", resolve));
    const address = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}/api`;
  }

  async stop() {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = undefined;
    this.baseUrl = "";
  }

  async post<T = any>(
    path: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) {
    return this.request<T>("POST", path, headers, JSON.stringify(body));
  }

  async get<T = any>(path: string, headers: Record<string, string> = {}) {
    return this.request<T>("GET", path, headers);
  }

  private async request<T>(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<TestResponse<T>> {
    if (!this.baseUrl) throw new Error("Test client is not started");

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body
    });

    const data = (await response.json()) as T;
    return { status: response.status, body: data };
  }
}
