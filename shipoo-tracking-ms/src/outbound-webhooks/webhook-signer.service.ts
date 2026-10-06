import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WebhookSignerService {
  sign(secret: string, timestamp: number, rawBody: string): string {
    const payload = `${timestamp}.${rawBody}`;
    const digest = createHmac('sha256', secret).update(payload).digest('hex');
    return `v1=${digest}`;
  }

  verify(
    secret: string,
    timestamp: number,
    rawBody: string,
    signature: string,
    toleranceSeconds = 300,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }
    const expected = this.sign(secret, timestamp, rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
