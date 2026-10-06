import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShippoCredentialResolver } from './shippo-credential.resolver.js';

export class ShippoHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class ShippoHttpClient {
  constructor(
    private readonly config: ConfigService,
    private readonly credentials: ShippoCredentialResolver,
  ) {}

  async request<T>(
    tenantId: string,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const token = await this.credentials.resolveApiToken(tenantId);
    const base = this.config.get<string>('shippo.apiBaseUrl') ?? '';
    const url = `${base}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `ShippoToken ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new ShippoHttpError(
        `Shippo API error ${res.status}`,
        res.status,
        text,
        retryable,
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
