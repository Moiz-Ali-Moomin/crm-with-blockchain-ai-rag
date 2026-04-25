import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  RegisterDto, RegisterSchema,
  LoginDto, LoginSchema,
  ForgotPasswordDto, ForgotPasswordSchema,
  ResetPasswordDto, ResetPasswordSchema,
} from './auth.dto';
import { Request, Response } from 'express';

const ACCESS_TOKEN_TTL_MS  = 15 * 60 * 1000;          // 15 min
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cookieBase(isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new organization + admin user' })
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    const { accessToken: _a, refreshToken: _r, ...safe } = result;
    return safe;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/password' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    const { accessToken: _a, refreshToken: _r, ...safe } = result;
    return safe;
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh-token cookie' })
  async refresh(
    @Req() req: Request & { user: { id: string; refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshTokens(req.user.id, req.user.refreshToken);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { message: 'Token refreshed' };
  }

  @Get('me')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Return the authenticated user from the JWT payload' })
  me(@CurrentUser() user: { id: string; email: string; tenantId: string; role: string }) {
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout — invalidates current session and clears cookies' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request & { cookies: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      req.cookies?.access_token ??
      (req.headers.authorization?.replace('Bearer ', '') ?? '');

    await this.authService.logout(userId, token);
    this.clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const base   = cookieBase(isProd);

    res.cookie('access_token',  accessToken,  { ...base, maxAge: ACCESS_TOKEN_TTL_MS });
    res.cookie('refresh_token', refreshToken, { ...base, maxAge: REFRESH_TOKEN_TTL_MS });
  }

  private clearAuthCookies(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const base   = cookieBase(isProd);
    res.clearCookie('access_token',  base);
    res.clearCookie('refresh_token', base);
  }
}
