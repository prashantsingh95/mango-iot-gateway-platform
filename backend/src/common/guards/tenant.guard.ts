import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
