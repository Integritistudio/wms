import { lookup as dnsLookup, type LookupOptions } from 'node:dns';
import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

function lookupWithTimeout(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
) {
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    const err = Object.assign(
      new Error(`SMTP DNS lookup timed out for ${hostname}`),
      { code: 'ETIMEDOUT' },
    );
    callback(err, '', 4);
  }, 4_000);
  dnsLookup(hostname, options, (err, address, family) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    callback(err, typeof address === 'string' ? address : '', family ?? 4);
  });
}

export interface SmtpSendInput {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

@Injectable()
export class SmtpProvider {
  private readonly logger = new Logger(SmtpProvider.name);

  async send(input: SmtpSendInput): Promise<{ messageId: string }> {
    const dns = { lookup: lookupWithTimeout };
    const transport = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      auth: input.user
        ? { user: input.user, pass: input.pass || '' }
        : undefined,
      connectionTimeout: 8_000,
      greetingTimeout: 6_000,
      socketTimeout: 12_000,
      tls: {
        // Reject unauthorized certs in production paths by default
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
      ...dns,
    });
    transport.on('error', (err) => {
      this.logger.warn({ err }, 'SMTP transport error');
    });

    try {
      const info = await transport.sendMail({
        from: input.from,
        to: input.to.join(', '),
        cc: input.cc?.length ? input.cc.join(', ') : undefined,
        bcc: input.bcc?.length ? input.bcc.join(', ') : undefined,
        replyTo: input.replyTo || undefined,
        subject: input.subject,
        text: input.text,
        html: input.html || undefined,
        headers: input.headers,
      });
      return { messageId: String(info.messageId || '') };
    } catch (err) {
      this.logger.warn({ err }, 'SMTP send failed');
      throw err;
    } finally {
      transport.close();
    }
  }
}
