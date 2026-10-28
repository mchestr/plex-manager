/**
 * The Content Security Policy and Strict-Transport-Security are not here:
 * `proxy.ts` sends both per request (P11.20), the policy with a fresh nonce
 * and HSTS from the runtime environment, which `headers()` (fixed at build
 * time) cannot read.
 *
 * @returns {import('next').NextConfig}
 */
module.exports = () => ({
  reactStrictMode: true,
  // Partial prerendering, 'use cache' and cacheTag (P11.19). Uncached data
  // renders per request, so no segment exports `dynamic` or `revalidate`.
  cacheComponents: true,
  // Links keep the full prefetch Cache Components shipped with; Partial
  // Prefetching is its own adoption (the Next docs' "Adopting Partial Prefetching").
  partialPrefetching: false,
  typedRoutes: true,
  output: 'standalone',
  poweredByHeader: false,
  // Stops `next dev` from writing AGENTS.md into the repo; CLAUDE.md already
  // holds the agent guidance.
  agentRules: false,
  serverExternalPackages: ['discord.js', '@discordjs/ws', 'zlib-sync', 'bufferutil', 'utf-8-validate', 'subset-font'],
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
    // The Rewind card fonts are read from disk (lib/rewind/cards/fonts.ts), and so
    // are the safe-mode Noto faces and harfbuzz's subsetter (lib/rewind/cards/noto.ts)
    '/api/rewind/card/[rewindId]/[page]': ['./lib/rewind/cards/fonts/*.ttf', './lib/rewind/cards/fonts/noto/*.ttf', './node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'],
    '/api/rewind/card/s/[assetKey]/[page]': ['./lib/rewind/cards/fonts/*.ttf', './lib/rewind/cards/fonts/noto/*.ttf', './node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'],
    '/api/rewind/card/preview/[previewId]/[page]': ['./lib/rewind/cards/fonts/*.ttf', './lib/rewind/cards/fonts/noto/*.ttf', './node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'],
    // Dry runs read the golden fixtures from disk (lib/rewind/dry-run/fixtures.ts): the admin pages that start them,
    // and for the playground's replay (lib/llm/replay.ts), the selected model and its recordings
    '/admin/**': ['./evals/rewind/fixtures/*.json', './evals/rewind/selected.json', './evals/rewind/recordings/**/*.json'],
  },
  // Rewind moved from /wrapped (P5.1). Browsers cache a 308, so every target
  // must keep working; the share rule comes first, or the catch-all would send
  // /wrapped/share/<token> to /rewind/share/<token>. Query strings are kept.
  async redirects() {
    return [
      { source: '/wrapped/share/:token', destination: '/rewind/s/:token', permanent: true },
      { source: '/wrapped/:path*', destination: '/rewind/:path*', permanent: true },
      // The v2 playground moved onto the production pipeline (P8.8)
      { source: '/admin/playground', destination: '/admin/rewind/playground', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // The public share page (P7.5, UI-39): kept out of search results, and
      // its token never leaves in a Referer. After the catch-all, so its
      // Referrer-Policy wins.
      {
        source: '/rewind/s/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
})
