import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import SftpClient from 'ssh2-sftp-client';
import { assertSafeSftpHost } from '../common/security/host.util.js';

export interface SftpAuthConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

@Injectable()
export class SftpClientService {
  private readonly logger = new Logger(SftpClientService.name);

  constructor(private readonly config: ConfigService) {}

  private options(cfg: SftpAuthConfig) {
    const allowPrivate = Boolean(this.config.get('security.allowPrivateHosts'));
    assertSafeSftpHost(cfg.host, allowPrivate);
    return {
      host: cfg.host,
      port: Number(cfg.port || 22),
      username: cfg.username,
      password: cfg.password,
      privateKey: cfg.privateKey,
      readyTimeout: 15000,
    };
  }

  async test(cfg: SftpAuthConfig): Promise<{ ok: true }> {
    const client = new SftpClient();
    try {
      await client.connect(this.options(cfg));
      return { ok: true };
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  async put(cfg: SftpAuthConfig, remotePath: string, body: Buffer): Promise<void> {
    const max = this.config.get<number>('security.maxFileBytes') ?? 5_242_880;
    if (body.length > max) throw new Error(`File exceeds max size ${max} bytes`);
    const client = new SftpClient();
    try {
      await client.connect(this.options(cfg));
      const dir = remotePath.includes('/')
        ? remotePath.slice(0, remotePath.lastIndexOf('/'))
        : '';
      if (dir && dir !== '.') {
        await client.mkdir(dir, true);
      }
      await client.put(body, remotePath);
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  async list(cfg: SftpAuthConfig, remoteDir: string) {
    const client = new SftpClient();
    try {
      await client.connect(this.options(cfg));
      const entries = await client.list(remoteDir || '/');
      return entries.filter((e) => e.type === '-');
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  async get(cfg: SftpAuthConfig, remotePath: string): Promise<Buffer> {
    const client = new SftpClient();
    try {
      await client.connect(this.options(cfg));
      const data = await client.get(remotePath);
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      const max = this.config.get<number>('security.maxFileBytes') ?? 5_242_880;
      if (buf.length > max) throw new Error(`Remote file exceeds max size ${max}`);
      return buf;
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  async remove(cfg: SftpAuthConfig, remotePath: string): Promise<void> {
    const client = new SftpClient();
    try {
      await client.connect(this.options(cfg));
      await client.delete(remotePath);
    } catch (err) {
      this.logger.warn({ err, remotePath }, 'Failed to delete remote file');
    } finally {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
}
