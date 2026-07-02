import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import ms from 'ms';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService,
  ) {}

  async register(dto: { email: string; password: string; name: string; tenantId?: string }) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    let tenantId = dto.tenantId;
    if (!tenantId) {
      const tenant = await this.prisma.tenant.create({
        data: {
          name: `${dto.name}'s Organization`,
          slug: `org-${uuidv4().slice(0, 8)}`,
        },
      });
      tenantId = tenant.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'ADMIN',
        tenantId,
      },
    });

    await this.loggingService.logAudit({
      action: 'REGISTER',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      tenantId,
    });

    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(email: string, password: string, tenantId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    if (tenantId && user.tenantId !== tenantId) throw new UnauthorizedException('Invalid tenant');

    const tokens = await this.generateTokens(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.loggingService.logAudit({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      tenantId: user.tenantId,
    });

    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.loggingService.logAudit({
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: userId,
      userId,
      tenantId: user.tenantId,
    });

    return { message: 'Password changed successfully' };
  }

  async getUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        expiresIn: this.configService.get<string>('jwt.refreshExpiration'),
      },
    );

    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt: new Date(Date.now() + ms(this.configService.get<string>('jwt.expiration', '15m') as any)),
      },
    });

    return { accessToken, refreshToken, sessionId: session.id };
  }

  private sanitizeUser(user: any) {
    const { passwordHash, refreshToken, mfaSecret, ...sanitized } = user;
    return sanitized;
  }
}
