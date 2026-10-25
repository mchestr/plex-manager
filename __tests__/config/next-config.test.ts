/**
 * @jest-environment node
 *
 * next.config.js must keep the image optimizer off (SEC-01) and hide the
 * framework header in every phase. The CSP is the proxy's since P11.20
 * (`__tests__/proxy-csp.test.ts`); the other headers are in
 * `__tests__/config/security-headers.test.ts`.
 */

import type { NextConfig } from "next"
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants"

type ConfigFactory = (phase: string) => NextConfig

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = env.NODE_ENV

function loadConfig(phase: string, nodeEnv?: string): NextConfig {
  if (nodeEnv === undefined) {
    delete env.NODE_ENV
  } else {
    env.NODE_ENV = nodeEnv
  }
  let factory: ConfigFactory | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory = require("../../next.config.js")
  })
  if (typeof factory !== "function") {
    throw new Error("next.config.js must export a phase function")
  }
  return factory(phase)
}

afterEach(() => {
  env.NODE_ENV = originalNodeEnv
})

describe("next.config.js", () => {
  describe.each([PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER])(
    "in %s",
    (phase) => {
      it("turns the image optimizer off and allows no remote image hosts", () => {
        const config = loadConfig(phase)

        expect(config.images?.unoptimized).toBe(true)
        expect(config.images).not.toHaveProperty("remotePatterns")
        expect(config.images).not.toHaveProperty("domains")
        expect(config.images).not.toHaveProperty("dangerouslyAllowLocalIP")
      })

      it("has no webpack callback or turbopack block", () => {
        const config = loadConfig(phase)

        expect(config).not.toHaveProperty("webpack")
        expect(config).not.toHaveProperty("turbopack")
      })

      it("disables the X-Powered-By header", () => {
        expect(loadConfig(phase).poweredByHeader).toBe(false)
      })

      it("stops next dev from writing AGENTS.md into the repo", () => {
        expect(loadConfig(phase).agentRules).toBe(false)
      })
    }
  )
})

describe("next.config.js share page headers (P7.5, UI-39)", () => {
  it("keeps /rewind/s/* out of search results and sends no referrer, after the catch-all", async () => {
    const config = loadConfig(PHASE_PRODUCTION_SERVER, "production")
    if (!config.headers) throw new Error("next.config.js has no headers()")
    const routes = await config.headers()
    const index = routes.findIndex((route) => route.source === "/rewind/s/:path*")
    expect(index).toBeGreaterThan(routes.findIndex((route) => route.source === "/:path*"))
    expect(routes[index].headers).toEqual([
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ])
  })
})
