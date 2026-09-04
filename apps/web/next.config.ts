import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@truenorth/core'],
  typedRoutes: false,

  // Testing on a phone means the dev server is reached by LAN address rather
  // than localhost, and Next blocks cross-origin dev requests by default.
  // These entries only affect `next dev`; production is unaffected.
  allowedDevOrigins: ['10.0.0.200', '192.168.0.0/16', '10.0.0.0/8', '*.local'],
};

export default config;
