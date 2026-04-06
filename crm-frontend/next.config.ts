import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname),
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  images: {
    domains: ['localhost', 'avatars.githubusercontent.com'],
  },
};

export default nextConfig;
