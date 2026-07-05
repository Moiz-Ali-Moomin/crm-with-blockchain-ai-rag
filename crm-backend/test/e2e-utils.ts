/**
 * Shared e2e helpers.
 *
 * bootstrapE2eApp() mirrors the production bootstrap in src/main.ts (prefix,
 * cookie parsing, global pipe/filter/interceptor) so e2e requests exercise the
 * exact request pipeline production traffic goes through — including the global
 * CsrfGuard, JwtAuthGuard and tenant scoping.
 */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from '../src/common/interceptors/response-transform.interceptor';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';

export const API = '/api/v1';

/** Header every state-changing request must carry to pass the CsrfGuard. */
export const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' } as const;

export async function bootstrapE2eApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true, bufferLogs: true });
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  await app.init();
  return app;
}

export interface TenantSession {
  cookies: string[];
  slug: string;
  email: string;
  password: string;
}

/** Extracts raw Set-Cookie strings usable as a Cookie request header. */
export function cookieHeader(res: request.Response): string[] {
  const setCookie = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((c: string) => c.split(';')[0]);
}

/**
 * Registers a brand-new organization + admin user and returns its auth cookies.
 * Slugs/emails are salted with time + randomness so repeat runs against the same
 * database never collide.
 */
export async function registerTenant(
  app: INestApplication,
  namePrefix: string,
): Promise<TenantSession> {
  const salt = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const slug = `${namePrefix}-${salt}`;
  const email = `admin@${namePrefix}-${salt}.example.com`;
  const password = 'E2ePassword123';

  const res = await request(app.getHttpServer())
    .post(`${API}/auth/register`)
    .set(CSRF_HEADER)
    .send({
      organizationName: `${namePrefix} ${salt}`,
      organizationSlug: slug,
      firstName: 'E2E',
      lastName: 'Admin',
      email,
      password,
    })
    .expect(201);

  return { cookies: cookieHeader(res), slug, email, password };
}
