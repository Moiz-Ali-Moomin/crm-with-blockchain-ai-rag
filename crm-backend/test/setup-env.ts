/**
 * E2E environment defaults.
 *
 * Values point at the local `docker compose up -d` dev stack so `npm run test:e2e`
 * works out of the box on a dev machine. CI overrides these with its own service
 * containers via job-level env vars — anything already set wins.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://crm_user:crm_password@localhost:5432/crm_db?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/crm_logs_test';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'e2e-only-jwt-secret-do-not-use-in-prod-0123456789';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'e2e-only-refresh-secret-do-not-use-in-prod-9876543210';

// Required at bootstrap by UsdcContractService / EthereumProviderService
// (getOrThrow). ethers providers are lazy — nothing connects during tests.
process.env.USDC_CONTRACT_ADDRESS =
  process.env.USDC_CONTRACT_ADDRESS || '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
process.env.RPC_URL = process.env.RPC_URL || 'https://rpc-amoy.polygon.technology';

// External integrations stay off — e2e must never hit paid APIs or chains.
process.env.ENABLE_AI = process.env.ENABLE_AI || 'false';
