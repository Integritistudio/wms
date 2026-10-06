import { createObserveModule } from '@nestjs/observe';
import type { DynamicModule } from '@nestjs/common';

const observeEnabled = process.env.OBSERVE_ENABLED === 'true';
const observeRoot = createObserveModule();

export const ObserveModule: DynamicModule[] = observeEnabled
  ? [
      observeRoot.ObserveModule.forRoot({
        appKey: process.env.OBSERVE_APP_KEY ?? '',
        appSecret: process.env.OBSERVE_APP_SECRET ?? '',
        serviceId: process.env.OBSERVE_SERVICE_ID ?? 'wms-tracking-ms',
      }),
    ]
  : [];

export const ObserveInstrument = observeEnabled
  ? observeRoot.ObserveInstrument
  : undefined;
