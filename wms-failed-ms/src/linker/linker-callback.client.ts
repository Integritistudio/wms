import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LinkerExecuteAction = 'retry' | 'reassign';

export interface LinkerExecuteResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

@Injectable()
export class LinkerCallbackClient {
  private readonly logger = new Logger(LinkerCallbackClient.name);

  constructor(private readonly config: ConfigService) {}

  async execute(input: {
    action: LinkerExecuteAction;
    orderId: string;
    failureId: string;
    warehouseId?: string | null;
    actor?: string;
  }): Promise<LinkerExecuteResult> {
    const base = this.config.get<string>('linker.baseUrl') ?? '';
    const secret = this.config.get<string>('linker.callbackSecret') ?? '';
    if (!base || !secret) {
      return { ok: false, message: 'Linker callback is not configured' };
    }

    const url = `${base}/api/internal/failed-ms/execute`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Failed-Ms-Secret': secret,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: input.action,
          orderId: input.orderId,
          failureId: input.failureId,
          warehouseId: input.warehouseId ?? undefined,
          actor: input.actor ?? 'failed-ms',
        }),
      });
      const text = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        data = { raw: text };
      }
      if (!res.ok) {
        const message =
          (data?.message as string) ||
          (data?.error as string) ||
          `Linker HTTP ${res.status}`;
        this.logger.warn({ status: res.status, message }, 'Linker execute failed');
        return { ok: false, message, data };
      }
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ err }, 'Linker execute request error');
      return { ok: false, message };
    }
  }
}
