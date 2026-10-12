import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContext, TenantContextStore } from './tenant.context.js';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { tenantContextStore?: TenantContextStore }>();
    const store = req.tenantContextStore;
    if (store) {
      return new Observable((subscriber) => {
        this.tenantContext.run(store, () => {
          next.handle().subscribe(subscriber);
        });
      });
    }
    return next.handle();
  }
}
