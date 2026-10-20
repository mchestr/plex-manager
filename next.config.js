const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

// React Refresh in `next dev` needs 'unsafe-eval' (E2E also runs on `next dev`
// until P1.5). Keyed to the Next phase rather than NODE_ENV, so a build or
// `next start` never ships it whatever NODE_ENV the shell exports.
function contentSecurityPolicy(phase) {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(phase === PHASE_DEVELOPMENT_SERVER ? ["'unsafe-eval'"] : []),
  ]

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join('; ')
}

/**
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
module.exports = (phase) => ({
  reactStrictMode: true,
  typedRoutes: true,
  output: 'standalone',
  poweredByHeader: false,
  // Stops `next dev` from writing AGENTS.md into the repo; CLAUDE.md already
  // holds the agent guidance.
  agentRules: false,
  serverExternalPackages: ['discord.js', '@discordjs/ws', 'zlib-sync', 'bufferutil', 'utf-8-validate'],
  // The optimizer would fetch and decode any URL an anonymous caller passes to
  // /_next/image. With it off, Next answers that route with a 404.
  images: {
    unoptimized: true,
  },
  // lib/og/fonts.ts reads the OG fonts with fs.readFile, which the standalone
  // trace cannot see.
  outputFileTracingIncludes: {
    '/icon/[id]': ['./lib/og/fonts/*'],
    '/apple-icon': ['./lib/og/fonts/*'],
    '/opengraph-image': ['./lib/og/fonts/*'],
    '/twitter-image': ['./lib/og/fonts/*'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy(phase)
          }
        ],
      },
    ]
  },
})
