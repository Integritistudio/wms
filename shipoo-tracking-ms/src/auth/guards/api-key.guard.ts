import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CORRELATION_HEADER } from '../../common/middleware/correlation.middleware.js';
import { ApiKeyService } from '../api-key.service.js';
import { TenantContext } from '../tenant.context.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = auth.slice('Bearer '.length).trim();
    const resolved = await this.apiKeys.validateBearerToken(token);
    const correlationId = req.headers[CORRELATION_HEADER];
    (req as Request & { tenantId: string }).tenantId = resolved.tenantId;
    this.tenantContext.run(
      {
        tenantId: resolved.tenantId,
        apiKeyId: resolved.apiKeyId,
        correlationId:
          typeof correlationId === 'string' ? correlationId : undefined,
      },
      () => undefined,
    );
    // Nest doesn't propagate ALS from guard; attach to request for interceptors
    (req as Request & { tenantContextStore: typeof resolved & { correlationId?: string } }).tenantContextStore = {
      ...resolved,
      correlationId:
        typeof correlationId === 'string' ? correlationId : undefined,
    };
    return true;
  }
}
