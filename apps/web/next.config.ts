import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@truenorth/core'],
  typedRoutes: false,
};

export default config;
