/**
 * @jest-environment node
 */

import { randomBytes } from "node:crypto"
import path from "node:path"

import { checkProductionEnv, envSchema, KNOWN_PLACEHOLDER_SECRETS, sessionCookieName, usesSecureCookies } from "@/lib/env"

const SECRET = randomBytes(32).toString("base64")

function issues(overrides: Record<string, string>) {
  return checkProductionEnv(
    envSchema.parse({
      NEXTAUTH_SECRET: SECRET,
      NEXTAUTH_URL: "https://plex.example.com",
      NEXT_PUBLIC_APP_URL: "https://plex.example.com",
      PLEX_CLIENT_IDENTIFIER: "0123456789abcdef0123456789abcdef",
      ...overrides,
    })
  )
}

const codes = (overrides: Record<string, string>) =>
  issues(overrides).map(({ variable, code, severity }) => `${severity} ${variable} ${code}`)

describe("envSchema", () => {
  it("parses an empty environment", () => {
    expect(() => envSchema.parse({})).not.toThrow()
  })

  it("resolves REWIND_CACHE_DIR against the working directory", () => {
    expect(envSchema.parse({}).REWIND_CACHE_DIR).toBe(path.resolve(".next/cache/rewind"))
    expect(envSchema.parse({ REWIND_CACHE_DIR: "/app/.next/cache/rewind" }).REWIND_CACHE_DIR).toBe(
      "/app/.next/cache/rewind"
    )
  })
})

describe("checkProductionEnv", () => {
  it("passes a random 44-character base64 secret with https URLs", () => {
    expect(SECRET).toHaveLength(44)
    expect(issues({})).toEqual([])
  })

  it.each([...KNOWN_PLACEHOLDER_SECRETS])("rejects the placeholder %s", (secret) => {
    expect(codes({ NEXTAUTH_SECRET: secret })).toEqual(["error NEXTAUTH_SECRET known_placeholder"])
  })

  it("rejects a missing, short or repetitive secret", () => {
    expect(codes({ NEXTAUTH_SECRET: "" })).toEqual(["error NEXTAUTH_SECRET missing"])
    expect(codes({ NEXTAUTH_SECRET: "a1b2c3d4e5f6g7h8" })).toEqual(["error NEXTAUTH_SECRET too_short"])
    expect(codes({ NEXTAUTH_SECRET: "abcabcabcabcabcabcabcabcabcabcabcabc" })).toEqual([
      "error NEXTAUTH_SECRET low_entropy",
    ])
  })

  it("rejects a public http URL and accepts loopback http", () => {
    expect(codes({ NEXTAUTH_URL: "http://plex.example.com", NEXT_PUBLIC_APP_URL: "http://plex.example.com" })).toEqual([
      "error NEXTAUTH_URL not_https",
      "error NEXT_PUBLIC_APP_URL not_https",
    ])
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3100", "http://[::1]:3000"]) {
      expect(codes({ NEXTAUTH_URL: url, NEXT_PUBLIC_APP_URL: url })).toEqual([])
    }
  })

  it("turns the http rejection into a warning with ALLOW_INSECURE_HTTP=true", () => {
    expect(
      codes({
        NEXTAUTH_URL: "http://plex.lan",
        NEXT_PUBLIC_APP_URL: "http://plex.lan",
        ALLOW_INSECURE_HTTP: "true",
      })
    ).toEqual(["warning NEXTAUTH_URL not_https", "warning NEXT_PUBLIC_APP_URL not_https"])
  })

  it("accepts the three process roles and rejects any other (P11.3)", () => {
    for (const role of ["web", "worker", "all"]) expect(codes({ PROCESS_ROLE: role })).toEqual([])
    expect(codes({ PROCESS_ROLE: "scheduler" })).toEqual(["error PROCESS_ROLE invalid"])
  })

  it("reports a missing PLEX_CLIENT_IDENTIFIER", () => {
    expect(codes({ PLEX_CLIENT_IDENTIFIER: "" })).toEqual(["error PLEX_CLIENT_IDENTIFIER missing"])
    expect(codes({ PLEX_CLIENT_IDENTIFIER: "  " })).toEqual(["error PLEX_CLIENT_IDENTIFIER missing"])
  })

  it("warns when the two URLs have different origins", () => {
    expect(codes({ NEXT_PUBLIC_APP_URL: "https://rewind.example.com" })).toEqual([
      "warning NEXT_PUBLIC_APP_URL origin_mismatch",
    ])
  })

  it("matches its JSDoc example", () => {
    expect(checkProductionEnv(envSchema.parse({ NEXTAUTH_SECRET: "changeme", PLEX_CLIENT_IDENTIFIER: "x" }))).toEqual([
      expect.objectContaining({ variable: "NEXTAUTH_SECRET", code: "known_placeholder", severity: "error" }),
    ])
  })

  it("never puts a secret value in its output", () => {
    for (const secret of [...KNOWN_PLACEHOLDER_SECRETS, "short-secret-value", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]) {
      const output = JSON.stringify(issues({ NEXTAUTH_SECRET: secret, NEXTAUTH_URL: "http://plex.example.com" }))
      expect(output).not.toContain(secret)
    }
  })
})

describe("session cookies", () => {
  it("are Secure, with the __Secure- name, only on https", () => {
    expect(usesSecureCookies("https://plex.example.com")).toBe(true)
    expect(sessionCookieName("https://plex.example.com")).toBe("__Secure-next-auth.session-token")
    expect(usesSecureCookies("http://localhost:3000")).toBe(false)
    expect(sessionCookieName("http://localhost:3000")).toBe("next-auth.session-token")
  })
})
