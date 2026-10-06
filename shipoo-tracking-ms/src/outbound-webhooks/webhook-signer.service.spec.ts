import { describe, expect, it } from 'vitest';
import { WebhookSignerService } from './webhook-signer.service.js';

describe('WebhookSignerService', () => {
  const signer = new WebhookSignerService();

  it('produces verifiable HMAC signatures', () => {
    const secret = 'whsec_test_secret';
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"id":"evt_1","type":"tracking.updated"}';
    const signature = signer.sign(secret, timestamp, body);
    expect(signature.startsWith('v1=')).toBe(true);
    expect(signer.verify(secret, timestamp, body, signature)).toBe(true);
  });

  it('rejects tampered bodies', () => {
    const secret = 'whsec_test_secret';
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"id":"evt_1"}';
    const signature = signer.sign(secret, timestamp, body);
    expect(signer.verify(secret, timestamp, '{"id":"evt_2"}', signature)).toBe(false);
  });
});
