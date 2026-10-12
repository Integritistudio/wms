import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { DevicePlatform } from '../common/enums.js';
import { Device } from '../database/entities/device.entity.js';
import { Notification } from '../database/entities/notification.entity.js';

export interface PushResult {
  ok: boolean;
  provider: string;
  detail: Record<string, unknown>;
  error?: string;
  disableDevice?: boolean;
}

@Injectable()
export class PushProvider {
  private readonly logger = new Logger(PushProvider.name);
  private vapidReady = false;

  constructor(private readonly config: ConfigService) {
    const pub = this.config.get<string>('push.vapidPublicKey') || '';
    const priv = this.config.get<string>('push.vapidPrivateKey') || '';
    const subject = this.config.get<string>('push.vapidSubject') || 'mailto:ops@example.com';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.vapidReady = true;
    }
  }

  async send(device: Device, notification: Notification): Promise<PushResult> {
    const payload = {
      title: notification.title,
      body: notification.message || notification.title,
      data: {
        notificationId: notification.id,
        type: notification.type,
        ...(notification.meta || {}),
      },
    };

    if (device.platform === DevicePlatform.WEB) {
      return this.sendWebPush(device, payload);
    }

    const fcmKey = this.config.get<string>('push.fcmServerKey') || '';
    if (fcmKey) {
      return this.sendFcm(device, payload, fcmKey);
    }

    const webhook = this.config.get<string>('push.webhookUrl') || '';
    if (webhook) {
      return this.sendWebhook(webhook, device, payload);
    }

    this.logger.warn(
      `No push provider configured; logging delivery for device ${device.id}`,
    );
    return {
      ok: true,
      provider: 'log',
      detail: { logged: true, platform: device.platform, title: payload.title },
    };
  }

  private async sendWebPush(
    device: Device,
    payload: { title: string; body: string; data: Record<string, unknown> },
  ): Promise<PushResult> {
    if (!this.vapidReady) {
      return {
        ok: false,
        provider: 'web_push',
        detail: {},
        error: 'VAPID keys not configured',
      };
    }
    const endpoint = device.endpoint || device.token;
    if (!device.p256dh || !device.auth) {
      return {
        ok: false,
        provider: 'web_push',
        detail: {},
        error: 'Web push device missing p256dh/auth keys',
      };
    }
    try {
      const res = await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        JSON.stringify(payload),
      );
      return {
        ok: true,
        provider: 'web_push',
        detail: { statusCode: res.statusCode },
      };
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      return {
        ok: false,
        provider: 'web_push',
        detail: { statusCode },
        error: err instanceof Error ? err.message : String(err),
        disableDevice: statusCode === 404 || statusCode === 410,
      };
    }
  }

  private async sendFcm(
    device: Device,
    payload: { title: string; body: string; data: Record<string, unknown> },
    serverKey: string,
  ): Promise<PushResult> {
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: device.token,
          notification: { title: payload.title, body: payload.body },
          data: Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, String(v)]),
          ),
        }),
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        body = { raw: text };
      }
      const ok = res.ok && Number(body.failure || 0) === 0;
      return {
        ok,
        provider: 'fcm',
        detail: { status: res.status, body },
        error: ok ? undefined : `FCM HTTP ${res.status}`,
        disableDevice: res.status === 404 || String(body.error) === 'NotRegistered',
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'fcm',
        detail: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async sendWebhook(
    url: string,
    device: Device,
    payload: { title: string; body: string; data: Record<string, unknown> },
  ): Promise<PushResult> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          token: device.token,
          platform: device.platform,
          title: payload.title,
          body: payload.body,
          data: payload.data,
        }),
      });
      const text = await res.text();
      return {
        ok: res.ok,
        provider: 'webhook',
        detail: { status: res.status, body: text.slice(0, 500) },
        error: res.ok ? undefined : `Webhook HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'webhook',
        detail: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
