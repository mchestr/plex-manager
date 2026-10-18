/**
 * @jest-environment node
 *
 * next.config.js must keep the image optimizer off (SEC-01), hide the
 * framework header and send a CSP that drops 'unsafe-eval' in production
 * builds while `next dev` keeps it (SEC-53, BP-05).
 */

import type { NextConfig } from "next"

type Header = { key: string; value: string }

const env = process.env as Record<string, string | undefined>
const originalNodeEnv = env.NODE_ENV

function loadConfig(nodeEnv: string): NextConfig {
  env.NODE_ENV = nodeEnv
  let config: NextConfig | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require("../../next.config.js")
  })
  if (!config) throw new Error("next.config.js did not export a config")
  return config
}

async function loadHeaders(nodeEnv: string): Promise<Header[]> {
  const config = loadConfig(nodeEnv)
  if (!config.headers) throw new Error("next.config.js has no headers()")
  const routes = await config.headers()
  const catchAll = routes.find((route) => route.source === "/:path*")
  if (!catchAll) throw new Error("no catch-all header route")
  return catchAll.headers
}

async function loadCsp(nodeEnv: string): Promise<Map<string, string[]>> {
  const headers = await loadHeaders(nodeEnv)
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
  describe.each(["production", "development"])("with NODE_ENV=%s", (nodeEnv) => {
    it("turns the image optimizer off and allows no remote image hosts", () => {
      const config = loadConfig(nodeEnv)

      expect(config.images?.unoptimized).toBe(true)
      expect(config.images).not.toHaveProperty("remotePatterns")
      expect(config.images).not.toHaveProperty("domains")
      expect(config.images).not.toHaveProperty("dangerouslyAllowLocalIP")
    })

    it("has no webpack callback or turbopack block", () => {
      const config = loadConfig(nodeEnv)

      expect(config).not.toHaveProperty("webpack")
      expect(config).not.toHaveProperty("turbopack")
    })

    it("disables the X-Powered-By header", () => {
      expect(loadConfig(nodeEnv).poweredByHeader).toBe(false)
    })

    it("blocks plugins, base-tag hijacking and cross-origin framing", async () => {
      const csp = await loadCsp(nodeEnv)

      expect(csp.get("object-src")).toEqual(["'none'"])
      expect(csp.get("base-uri")).toEqual(["'self'"])
      expect(csp.get("frame-ancestors")).toEqual(["'self'"])
    })

    it("leaves form-action unset so Server Actions can redirect to Stripe", async () => {
      const csp = await loadCsp(nodeEnv)

      expect(csp.has("form-action")).toBe(false)
    })
  })

  it("drops 'unsafe-eval' from the production script-src", async () => {
    const csp = await loadCsp("production")

    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"])
    expect([...csp.values()].flat()).not.toContain("'unsafe-eval'")
  })

  it.each(["development", "test"])(
    "keeps 'unsafe-eval' for next dev with NODE_ENV=%s",
    async (nodeEnv) => {
      const csp = await loadCsp(nodeEnv)

      expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"])
    }
  )
})
