import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId && !request.user?.tenantId) {
      throw new ForbiddenException('Tenant ID required');
    }

    if (request.user && request.user.role === 'SUPER_ADMIN') return true;

    const requestTenantId = tenantId || request.user?.tenantId;
    if (request.user && request.user.tenantId !== requestTenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    request.tenantId = requestTenantId;
    return true;
  }
}
