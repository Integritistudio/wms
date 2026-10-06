import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request & { tenantId?: string }>();
    if (!req.tenantId) {
      throw new Error('TenantId decorator requires ApiKeyGuard');
    }
    return req.tenantId;
  },
);
