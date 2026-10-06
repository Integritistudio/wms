import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
]);

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
    return true;
  }
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
  }
  return false;
}

@Injectable()
export class SsrfGuardService {
  constructor(private readonly config: ConfigService) {}

  async assertSafeUrl(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Invalid webhook URL');
    }
    const requireHttps =
      this.config.get<string>('nodeEnv') === 'production' ||
      this.config.get<boolean>('outboundWebhook.requireHttps');
    if (requireHttps && parsed.protocol !== 'https:') {
      throw new Error('Webhook URL must use HTTPS in production');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Webhook URL protocol is not allowed');
    }
    const allowPrivate =
      this.config.get<boolean>('outboundWebhook.allowPrivate') === true;
    const hostname = parsed.hostname.toLowerCase();
    if (!allowPrivate) {
      if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.internal')) {
        throw new Error('Webhook URL host is blocked');
      }
      if (isPrivateIp(hostname)) {
        throw new Error('Webhook URL host is blocked');
      }
      const records = await lookup(hostname, { all: true, verbatim: true });
      for (const record of records) {
        if (isPrivateIp(record.address)) {
          throw new Error('Webhook URL resolves to a private address');
        }
      }
    }
    return parsed;
  }
}
