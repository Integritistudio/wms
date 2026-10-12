import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

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
    const transport = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      auth: input.user
        ? { user: input.user, pass: input.pass || '' }
        : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      tls: {
        // Reject unauthorized certs in production paths by default
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
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
