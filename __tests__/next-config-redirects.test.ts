/**
 * @jest-environment node
 *
 * Old `/wrapped` links keep working after Rewind moved to `/rewind` (P5.1):
 * both redirects are permanent, and the share rule comes before the
 * catch-all, which would otherwise send share links to `/rewind/share/...`.
 */

import type { NextConfig } from "next"
import { PHASE_PRODUCTION_SERVER } from "next/constants"

type Redirect = { source: string; destination: string; permanent?: boolean }

async function loadRedirects(): Promise<Redirect[]> {
  let config: NextConfig | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const factory = require("../next.config.js") as (phase: string) => NextConfig
    config = factory(PHASE_PRODUCTION_SERVER)
  })
  return (await config!.redirects!()) as Redirect[]
}

describe("next.config.js redirects", () => {
  it("moves share links first, then every other /wrapped path", async () => {
    expect(await loadRedirects()).toEqual([
      { source: "/wrapped/share/:token", destination: "/rewind/s/:token", permanent: true },
      { source: "/wrapped/:path*", destination: "/rewind/:path*", permanent: true },
    ])
  })

  it("makes both permanent (308)", async () => {
    for (const rule of await loadRedirects()) expect(rule.permanent).toBe(true)
  })
})
