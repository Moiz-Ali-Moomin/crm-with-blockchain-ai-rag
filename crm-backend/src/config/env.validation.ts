/**
 * Environment variable validation using Zod
 * Called at application startup - crashes fast if required vars are missing
 */

import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001'),
  API_VERSION: z.string().default('v1'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Databases
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  MONGO_URI: z.string().min(1).optional(), // Required only if AI/RAG features are enabled

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_TTL: z.string().default('3600'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // SendGrid
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().default('CRM Platform'),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_PRO: z.string().optional(),
  STRIPE_PRICE_ID_ENTERPRISE: z.string().optional(),

  // App URLs
  APP_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:3001'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // OpenAI (RAG + embeddings + copilot)
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),

  // Blockchain / Polygon
  BLOCKCHAIN_RPC_URL: z.string().url().optional(),
  BLOCKCHAIN_PRIVATE_KEY: z.string().optional(),
  BLOCKCHAIN_CONTRACT_ADDR: z.string().optional(),
  BLOCKCHAIN_NETWORK: z.string().default('polygon-amoy'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    throw new Error(`❌ Environment validation failed:\n${errors}\n\nCheck your .env file.`);
  }

  return result.data;
}
