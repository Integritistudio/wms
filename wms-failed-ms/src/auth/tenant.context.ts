import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextStore {
  tenantId: string;
  apiKeyId: string;
  correlationId?: string;
}

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  run<T>(store: TenantContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  get(): TenantContextStore | undefined {
    return this.storage.getStore();
  }

  requireTenantId(): string {
    const store = this.get();
    if (!store?.tenantId) {
      throw new Error('Tenant context is not available');
    }
    return store.tenantId;
  }
}
