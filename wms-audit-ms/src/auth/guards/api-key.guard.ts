import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyService } from '../api-key.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const resolved = await this.apiKeys.validateBearerToken(
      auth.slice('Bearer '.length).trim(),
    );
    (req as Request & { tenantId: string }).tenantId = resolved.tenantId;
    (req as Request & { tenantContextStore: typeof resolved }).tenantContextStore =
      resolved;
    return true;
  }
}
