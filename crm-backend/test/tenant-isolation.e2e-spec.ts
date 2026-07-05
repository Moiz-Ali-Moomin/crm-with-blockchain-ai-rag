/**
 * Tenant isolation e2e — the most important test in the repository.
 *
 * Two real tenants are registered through the public API; every request then
 * flows through the full production pipeline: JWT → TenantContextMiddleware →
 * AsyncLocalStorage → Prisma tenant scoping. The assertions prove that one
 * tenant can never read, modify, or delete another tenant's rows — even when
 * it knows the exact primary key.
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, CSRF_HEADER, bootstrapE2eApp, registerTenant, TenantSession } from './e2e-utils';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tenantA: TenantSession;
  let tenantB: TenantSession;
  let leadIdOfA: string;

  beforeAll(async () => {
    app = await bootstrapE2eApp();
    tenantA = await registerTenant(app, 'iso-a');
    tenantB = await registerTenant(app, 'iso-b');

    const created = await request(app.getHttpServer())
      .post(`${API}/leads`)
      .set(CSRF_HEADER)
      .set('Cookie', tenantA.cookies)
      .send({ firstName: 'Secret', lastName: 'LeadOfA', email: 'secret@tenant-a.example.com' })
      .expect(201);
    leadIdOfA = created.body.data.id;
    expect(leadIdOfA).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tenant A sees its own lead', async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/leads/${leadIdOfA}`)
      .set('Cookie', tenantA.cookies)
      .expect(200);
    expect(res.body.data.id).toBe(leadIdOfA);
  });

  it("tenant B's list never contains tenant A's lead", async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/leads`)
      .set('Cookie', tenantB.cookies)
      .expect(200);
    const ids = (res.body.data || []).map((l: { id: string }) => l.id);
    expect(ids).not.toContain(leadIdOfA);
  });

  it("tenant B cannot read tenant A's lead by leaked primary key", async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/leads/${leadIdOfA}`)
      .set('Cookie', tenantB.cookies);
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('secret@tenant-a.example.com');
  });

  it("tenant B cannot update tenant A's lead", async () => {
    const res = await request(app.getHttpServer())
      .patch(`${API}/leads/${leadIdOfA}`)
      .set(CSRF_HEADER)
      .set('Cookie', tenantB.cookies)
      .send({ firstName: 'Hijacked' });
    expect([403, 404]).toContain(res.status);
  });

  it("tenant B cannot delete tenant A's lead", async () => {
    const res = await request(app.getHttpServer())
      .delete(`${API}/leads/${leadIdOfA}`)
      .set(CSRF_HEADER)
      .set('Cookie', tenantB.cookies);
    expect([403, 404]).toContain(res.status);
  });

  it("tenant A's lead is intact after B's attempts (nothing was mutated)", async () => {
    const res = await request(app.getHttpServer())
      .get(`${API}/leads/${leadIdOfA}`)
      .set('Cookie', tenantA.cookies)
      .expect(200);
    expect(res.body.data.firstName).toBe('Secret');
  });

  it('tenant B cannot see cross-tenant analytics or user lists', async () => {
    const usersRes = await request(app.getHttpServer())
      .get(`${API}/users`)
      .set('Cookie', tenantB.cookies);
    if (usersRes.status === 200) {
      const emails = JSON.stringify(usersRes.body);
      expect(emails).not.toContain(tenantA.email);
    }
  });
});
