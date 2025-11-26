/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['discord.js', '@discordjs/ws', 'zlib-sync', 'bufferutil', 'utf-8-validate'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;"
          }
        ],
      },
    ]
  },
  // Turbopack configuration
  // The serverExternalPackages option handles Discord.js externals in Turbopack
  turbopack: {},

  // Keep webpack config for compatibility when explicitly using --webpack flag
  webpack: (config, { isServer }) => {
    // Exclude Discord.js and native dependencies from bundling
    // These are server-only modules that shouldn't be bundled
    if (isServer) {
      const existingExternals = config.externals || []
      config.externals = [
        ...(Array.isArray(existingExternals) ? existingExternals : [existingExternals]),
        // Mark Discord.js packages as external to prevent bundling
        ({ request }, callback) => {
          if (
            request === 'discord.js' ||
            request === '@discordjs/ws' ||
            request === 'zlib-sync' ||
            request === 'bufferutil' ||
            request === 'utf-8-validate' ||
            request?.startsWith('discord.js/') ||
            request?.startsWith('@discordjs/')
          ) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }
    return config
  },
}

module.exports = nextConfig

