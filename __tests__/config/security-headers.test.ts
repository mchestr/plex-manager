/**
 * @jest-environment node
 *
 * The header tidy (P11.20, SEC-53): next.config.js drops the deprecated
 * headers, hides the framework and narrows the referrer; the CSP and HSTS
 * moved to proxy.ts, which builds them per request, and HSTS defaults to one
 * year without includeSubDomains or preload.
 */

import type { NextConfig } from "next"
import { PHASE_PRODUCTION_SERVER } from "next/constants"

import { hstsHeader, isValidHstsMaxAge } from "@/lib/security/hsts"

type ConfigFactory = (phase: string) => NextConfig

function loadConfig(): NextConfig {
  let factory: ConfigFactory | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory = require("../../next.config.js")
  })
  if (typeof factory !== "function") throw new Error("next.config.js must export a phase function")
  return factory(PHASE_PRODUCTION_SERVER)
}

async function catchAllHeaders(): Promise<Map<string, string>> {
  const config = loadConfig()
  if (!config.headers) throw new Error("next.config.js has no headers()")
  const routes = await config.headers()
  const catchAll = routes.find((route) => route.source === "/:path*")
  if (!catchAll) throw new Error("no catch-all header route")
  return new Map(catchAll.headers.map(({ key, value }) => [key.toLowerCase(), value]))
}

describe("next.config.js security headers", () => {
  it("turns off X-Powered-By", () => {
    expect(loadConfig().poweredByHeader).toBe(false)
  })

  it("sends no X-XSS-Protection or X-DNS-Prefetch-Control", async () => {
    const headers = await catchAllHeaders()

    expect(headers.has("x-xss-protection")).toBe(false)
    expect(headers.has("x-dns-prefetch-control")).toBe(false)
  })

  it("keeps framing, sniffing and permissions locked and narrows the referrer", async () => {
    const headers = await catchAllHeaders()

    expect(headers.get("x-frame-options")).toBe("SAMEORIGIN")
    expect(headers.get("x-content-type-options")).toBe("nosniff")
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()")
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin")
  })

  it("leaves the CSP and HSTS to the proxy, which reads them at run time", async () => {
    const headers = await catchAllHeaders()

    expect(headers.has("content-security-policy")).toBe(false)
    expect(headers.has("strict-transport-security")).toBe(false)
  })
})

describe("hstsHeader", () => {
  it("defaults to one year without includeSubDomains or preload", () => {
    expect(hstsHeader({}, true)).toBe("max-age=31536000")
  })

  it("adds each flag only when it is true", () => {
    expect(hstsHeader({ HSTS_INCLUDE_SUBDOMAINS: "true" }, true)).toBe("max-age=31536000; includeSubDomains")
    expect(hstsHeader({ HSTS_PRELOAD: "1", HSTS_INCLUDE_SUBDOMAINS: "false" }, true)).toBe("max-age=31536000")
  })

  it("is not sent over http", () => {
    expect(hstsHeader({ HSTS_PRELOAD: "true" }, false)).toBeNull()
  })

  it("accepts only a whole number of seconds", () => {
    expect(isValidHstsMaxAge(undefined)).toBe(true)
    expect(isValidHstsMaxAge("0")).toBe(true)
    expect(isValidHstsMaxAge("1y")).toBe(false)
    expect(isValidHstsMaxAge("-1")).toBe(false)
    expect(hstsHeader({ HSTS_MAX_AGE: "1y" }, true)).toBe("max-age=31536000")
  })
})
