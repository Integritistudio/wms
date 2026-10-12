import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextStore {
  tenantId: string;
  apiKeyId: string;
}

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();
  run<T>(store: TenantContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }
  get() {
    return this.storage.getStore();
  }
}
