import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SsrfGuardService } from './ssrf-guard.service.js';

describe('SsrfGuardService', () => {
  const config = {
    get: (key: string) => {
      if (key === 'nodeEnv') return 'development';
      if (key === 'outboundWebhook.requireHttps') return false;
      return undefined;
    },
  } as ConfigService;

  it('blocks localhost URLs before DNS', async () => {
    const guard = new SsrfGuardService(config);
    await expect(guard.assertSafeUrl('http://127.0.0.1/hook')).rejects.toThrow();
    await expect(guard.assertSafeUrl('http://localhost/hook')).rejects.toThrow();
  });

  it('blocks unsafe protocols', async () => {
    const guard = new SsrfGuardService(config);
    await expect(guard.assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
  });
});
