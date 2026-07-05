import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, bootstrapE2eApp } from './e2e-utils';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live responds without auth (liveness probe contract)', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/health/live`).expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /health/ready reports database readiness', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/health/ready`);
    // Terminus returns 200 when all indicators pass, 503 otherwise —
    // either way the endpoint must answer, never hang or 500.
    expect([200, 503]).toContain(res.status);
  });
});
