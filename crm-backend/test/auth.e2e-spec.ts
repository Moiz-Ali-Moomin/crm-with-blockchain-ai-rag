/**
 * Auth flow e2e — register → login → me → logout → token revocation.
 *
 * Runs against real Postgres + Redis: the register path exercises tenant
 * bootstrap (withoutTenantScope), login exercises bcrypt + JWT issuance,
 * logout exercises the Redis token blacklist.
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, CSRF_HEADER, bootstrapE2eApp, cookieHeader, registerTenant } from './e2e-utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ organizationSlug: 'whatever', email: 'a@b.co', password: 'Whatever123' })
      .expect(403);
  });

  it('registers a new organization and sets HttpOnly auth cookies', async () => {
    const salt = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .set(CSRF_HEADER)
      .send({
        organizationName: `Auth E2E ${salt}`,
        organizationSlug: `auth-e2e-${salt}`,
        firstName: 'Auth',
        lastName: 'Tester',
        email: `auth-${salt}@example.com`,
        password: 'E2ePassword123',
      })
      .expect(201);

    const rawCookies = (res.headers['set-cookie'] as unknown as string[]) || [];
    expect(rawCookies.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(rawCookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(rawCookies.every((c) => /HttpOnly/i.test(c))).toBe(true);
    // Tokens must never leak into the response body — cookie-only contract
    expect(JSON.stringify(res.body)).not.toContain('accessToken');
  });

  it('rejects a duplicate organization slug', async () => {
    const session = await registerTenant(app, 'dup-slug');
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .set(CSRF_HEADER)
      .send({
        organizationName: 'Duplicate Org',
        organizationSlug: session.slug,
        firstName: 'Dup',
        lastName: 'User',
        email: `other-${Date.now()}@example.com`,
        password: 'E2ePassword123',
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects login with a wrong password', async () => {
    const session = await registerTenant(app, 'wrong-pass');
    await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER)
      .send({ organizationSlug: session.slug, email: session.email, password: 'WrongPass123' })
      .expect(401);
  });

  it('logs in, reads own profile, logs out, and the old token is revoked', async () => {
    const session = await registerTenant(app, 'lifecycle');

    const loginRes = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER)
      .send({ organizationSlug: session.slug, email: session.email, password: session.password })
      .expect(200);
    const cookies = cookieHeader(loginRes);

    const meRes = await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', cookies)
      .expect(200);
    expect(meRes.body.data.email).toBe(session.email);

    await request(app.getHttpServer())
      .post(`${API}/auth/logout`)
      .set(CSRF_HEADER)
      .set('Cookie', cookies)
      .expect(200);

    // The blacklisted access token must no longer authenticate
    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', cookies)
      .expect(401);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    await request(app.getHttpServer()).get(`${API}/auth/me`).expect(401);
    await request(app.getHttpServer()).get(`${API}/leads`).expect(401);
  });
});
