import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // PF-07: transform barrel imports into direct module imports to cut
  // parse/compile work on the main thread (verified by check-bundle gate).
  experimental: {
    optimizePackageImports: ['@carbon/react', '@carbon/icons-react', 'recharts'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'node:diagnostics_channel': 'commonjs node:diagnostics_channel',
        'node:async_hooks': 'commonjs node:async_hooks',
      });
    }
    return config;
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const headersList = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      // NOTE (SEC-05): Content-Security-Policy is set per-request with a
      // fresh nonce in middleware.ts — it must NOT be set here, otherwise
      // the static header's unsafe-inline would widen the nonce policy
      // (two CSP headers enforce the intersection).
    ];

    if (isProd) {
      headersList.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      {
        source: '/:path*',
        headers: headersList,
      },
      {
        // PF-04/06: hashed static assets are immutable — cache for a year.
        // HTML/API responses stay dynamic (no Cache-Control added).
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);