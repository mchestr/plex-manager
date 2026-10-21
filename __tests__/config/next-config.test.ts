/**
 * @jest-environment node
 *
 * next.config.js must keep the image optimizer off (SEC-01), hide the
 * framework header and send a CSP that drops 'unsafe-eval' in every phase but
 * `next dev`, whatever NODE_ENV is set (SEC-53, BP-05).
 */

import type { NextConfig } from "next"
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants"

type Header = { key: string; value: string }
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

async function loadHeaders(phase: string, nodeEnv?: string): Promise<Header[]> {
  const config = loadConfig(phase, nodeEnv)
  if (!config.headers) throw new Error("next.config.js has no headers()")
  const routes = await config.headers()
  const catchAll = routes.find((route) => route.source === "/:path*")
  if (!catchAll) throw new Error("no catch-all header route")
  return catchAll.headers
}

async function loadCsp(phase: string, nodeEnv?: string): Promise<Map<string, string[]>> {
  const headers = await loadHeaders(phase, nodeEnv)
  const csp = headers.find((header) => header.key === "Content-Security-Policy")
  if (!csp) throw new Error("no Content-Security-Policy header")
  return new Map(
    csp.value
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter((tokens) => tokens[0] !== "")
      .map(([name, ...sources]) => [name, sources])
  )
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

      it("blocks plugins, base-tag hijacking and cross-origin framing", async () => {
        const csp = await loadCsp(phase)

        expect(csp.get("object-src")).toEqual(["'none'"])
        expect(csp.get("base-uri")).toEqual(["'self'"])
        expect(csp.get("frame-ancestors")).toEqual(["'self'"])
      })

      it("leaves form-action unset so Server Actions can redirect to Stripe", async () => {
        const csp = await loadCsp(phase)

        expect(csp.has("form-action")).toBe(false)
      })
    }
  )

  describe.each([PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER])(
    "drops 'unsafe-eval' in %s",
    (phase) => {
      it.each([undefined, "production", "test", "development", "staging"])(
        "with NODE_ENV=%s",
        async (nodeEnv) => {
          const csp = await loadCsp(phase, nodeEnv)

          expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"])
          expect([...csp.values()].flat()).not.toContain("'unsafe-eval'")
        }
      )
    }
  )

  it.each(["development", "test", "production"])(
    "keeps 'unsafe-eval' for next dev with NODE_ENV=%s",
    async (nodeEnv) => {
      const csp = await loadCsp(PHASE_DEVELOPMENT_SERVER, nodeEnv)

      expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"])
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
