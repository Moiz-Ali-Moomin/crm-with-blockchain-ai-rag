/**
 * Auth Service
 *
 * Token strategy:
 * - Access token: 15min JWT, contains userId/tenantId/role
 * - Refresh token: 7day JWT, SHA-256 hash stored in refresh_sessions table
 * - Per-session storage: each login creates an independent session row;
 *   multiple devices can be active simultaneously
 * - Refresh token rotation: each use deletes the old session and issues a new one
 * - Reuse detection: if a rotated token is re-submitted, ALL sessions are invalidated
 * - Logout: access token added to Redis blacklist; current session deleted from DB
 */

import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  UnauthorizedError,
  ConflictError,
  BusinessRuleError,
} from '../../shared/errors/domain.errors';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { addDays } from 'date-fns';
import { AuthRepository } from './auth.repository';
import { TokenBlacklistService } from './token-blacklist.service';
import { PrismaTransactionService } from '../../core/database/prisma-transaction.service';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly blacklist: TokenBlacklistService,
    private readonly tx: PrismaTransactionService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  async register(dto: RegisterDto) {
    const existingTenant = await this.authRepo.findTenantBySlug(dto.organizationSlug);
    if (existingTenant) {
      throw new ConflictError(
        'Registration failed. Please try a different organization name.'
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // 🔥 CRITICAL FIX: bypass tenant middleware for bootstrap
    const { user, tenant } = await this.tx.withoutTenantScope(async () => {
      return this.tx.run(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: dto.organizationName,
            slug: dto.organizationSlug,
          },
        });

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: dto.email.toLowerCase(),
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: UserRole.ADMIN,
          },
        });

        const pipeline = await tx.pipeline.create({
          data: {
            tenantId: tenant.id,
            name: 'Sales Pipeline',
            isDefault: true,
          },
        });

        const defaultStages = [
          { name: 'Lead', position: 0, probability: 0.1, color: '#94a3b8' },
          { name: 'Qualified', position: 1, probability: 0.3, color: '#60a5fa' },
          { name: 'Proposal', position: 2, probability: 0.5, color: '#a78bfa' },
          { name: 'Negotiation', position: 3, probability: 0.7, color: '#fb923c' },
          { name: 'Closed Won', position: 4, probability: 1.0, color: '#4ade80', isWon: true },
          { name: 'Closed Lost', position: 5, probability: 0.0, color: '#f87171', isLost: true },
        ];

        await tx.stage.createMany({
          data: defaultStages.map((s) => ({
            ...s,
            pipelineId: pipeline.id,
            tenantId: tenant.id,
          })),
        });

        return { user, tenant };
      });
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      tenant.id,
      user.role
    );

    return {
      user: this.sanitizeUser(user),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    let user;
    let tenant;

    if (dto.organizationSlug) {
      // Step 1: Explicit login — resolve tenant first
      tenant = await this.authRepo.findTenantBySlug(dto.organizationSlug);
      user = tenant
        ? await this.authRepo.findByEmailAndTenant(dto.email.toLowerCase(), tenant.id)
        : null;
    } else {
      // Step 1: Global login — find user by email across all tenants
      // This helper includes the tenant relation
      user = await this.authRepo.findByEmail(dto.email.toLowerCase());
      tenant = user?.tenant;
    }

    // Step 3: validate password. Generic error prevents tenant/user enumeration.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is not active. Contact your administrator.');
    }

    const tokens = await this.generateTokens(user.id, user.email, tenant!.id, user.role);

    await this.authRepo.updateLastLogin(user.id);

    return {
      user: this.sanitizeUser(user),
      tenant: { id: tenant!.id, name: tenant!.name, slug: tenant!.slug },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    // SHA-256 hash for fast indexed lookup (JWTs have sufficient entropy; bcrypt not needed here)
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const user = await this.authRepo.consumeRefreshSession(tokenHash);

    if (!user) {
      // No session found — this token was already rotated. Possible replay attack:
      // invalidate ALL sessions for this user as a precaution.
      await this.authRepo.deleteAllRefreshSessions(userId);
      throw new UnauthorizedError('Session expired or refresh token reuse detected. Please log in again.');
    }

    // Extra integrity check: JWT sub must match the session owner
    if (user.id !== userId) {
      await this.authRepo.deleteAllRefreshSessions(userId);
      throw new UnauthorizedError('Token/session mismatch. All sessions invalidated.');
    }

    return this.generateTokens(user.id, user.email, user.tenantId, user.role);
  }

  async logout(userId: string, accessToken: string, refreshToken?: string) {
    // Blacklist the access token in Redis until it naturally expires
    await this.blacklist.add(accessToken);

    if (refreshToken) {
      // Surgical logout: remove only the session for this device
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      await this.authRepo.deleteRefreshSession(tokenHash);
    } else {
      // Fallback (no cookie sent): clear all sessions to be safe
      await this.authRepo.deleteAllRefreshSessions(userId);
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.authRepo.findByEmail(dto.email.toLowerCase());

    // Always return success to prevent email enumeration attacks
    if (!user) return { message: 'If this email exists, a reset link has been sent.' };

    const resetToken = await this.authRepo.createPasswordResetToken(user.id);

    // Use URL constructor to safely compose the link — prevents header/HTML injection
    // if APP_URL is misconfigured in lower environments
    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    const resetUrl = new URL('/reset-password', appUrl);
    resetUrl.searchParams.set('token', resetToken);
    const resetLink = resetUrl.toString();

    // Enqueue password-reset email — fire-and-forget
    this.emailQueue
      .add(
        'password-reset',
        {
          to: user.email,
          subject: 'Reset your password',
          html: `<p>Click the link below to reset your password. The link expires in 1 hour.</p><p><a href="${resetLink}">${resetLink}</a></p>`,
          communicationId: null,
        },
        QUEUE_JOB_OPTIONS.email,
      )
      .catch(() => {/* non-fatal — user can request another reset */});

    return { message: 'If this email exists, a reset link has been sent.' };
  }

  async getMe(userId: string) {
    const user = await this.authRepo.findById(userId);
    if (!user) throw new UnauthorizedError('User not found');
    return this.sanitizeUser(user);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Single atomic UPDATE: validates token hash + expiry and clears token fields
    // in one statement — prevents race conditions on concurrent reset requests
    const user = await this.authRepo.resetPasswordAtomic(dto.token, passwordHash);

    if (!user) {
      throw new BusinessRuleError('Invalid or expired password reset token');
    }

    // Invalidate all existing sessions after password change
    await this.authRepo.deleteAllRefreshSessions(user.id);

    return { message: 'Password reset successfully. Please log in.' };
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
  ) {
    const payload = { sub: userId, email, tenantId, role };

    const refreshExpiryDays = parseInt(
      this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS', '7'),
      10,
    );

    // jti makes every issued token unique. Without it, two logins within the
    // same second produce byte-identical JWTs (same claims, same iat), which
    // collides on the RefreshSession.tokenHash unique index and breaks
    // per-session revocation semantics.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...payload, jti: randomUUID() }, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync({ ...payload, jti: randomUUID() }, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    // Store SHA-256 hash in a dedicated session row (fast indexed lookup, supports multi-device)
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = addDays(new Date(), refreshExpiryDays);
    await this.authRepo.createRefreshSession(userId, tenantId, tokenHash, expiresAt);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: Record<string, any>) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
