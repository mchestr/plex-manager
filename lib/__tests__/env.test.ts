/**
 * @jest-environment node
 */

import { randomBytes } from "node:crypto"
import path from "node:path"

import { checkProductionEnv, envSchema, KNOWN_PLACEHOLDER_SECRETS, sessionCookieName, usesSecureCookies } from "@/lib/env"

const SECRET = randomBytes(32).toString("base64")
const KEYRING = `k1:${randomBytes(32).toString("base64")}`

function issues(overrides: Record<string, string>) {
  return checkProductionEnv(
    envSchema.parse({
      NEXTAUTH_SECRET: SECRET,
      NEXTAUTH_URL: "https://plex.example.com",
      NEXT_PUBLIC_APP_URL: "https://plex.example.com",
      PLEX_CLIENT_IDENTIFIER: "0123456789abcdef0123456789abcdef",
      ENCRYPTION_KEYS: KEYRING,
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
      expect.objectContaining({ variable: "ENCRYPTION_KEY", code: "missing", severity: "error" }),
    ])
  })

  describe("encryption keys (P11.1)", () => {
    const legacyKey = randomBytes(24).toString("hex")

    it("refuses production without any key", () => {
      expect(codes({ ENCRYPTION_KEYS: "" })).toEqual(["error ENCRYPTION_KEY missing"])
    })

    it("accepts a keyring, or a legacy key of 32 characters or more on its own", () => {
      expect(codes({})).toEqual([])
      expect(codes({ ENCRYPTION_KEYS: "", ENCRYPTION_KEY: legacyKey })).toEqual([])
    })

    it("flags a keyring entry that is not 32 bytes, without printing it", () => {
      const short = randomBytes(31).toString("base64")
      const found = issues({ ENCRYPTION_KEYS: `${KEYRING},k2:${short}` })
      expect(found.map(({ variable, code, severity }) => `${severity} ${variable} ${code}`)).toEqual(["error ENCRYPTION_KEYS weak"])
      expect(found[0].hint).toContain("k2 (not_32_bytes)")
      expect(JSON.stringify(found)).not.toContain(short)
      expect(JSON.stringify(found)).not.toContain(KEYRING.slice(3))
    })

    it("flags a short legacy key and one equal to NEXTAUTH_SECRET", () => {
      expect(codes({ ENCRYPTION_KEYS: "", ENCRYPTION_KEY: "too-short" })).toEqual(["error ENCRYPTION_KEY weak"])
      expect(codes({ ENCRYPTION_KEYS: "", ENCRYPTION_KEY: SECRET })).toEqual(["error ENCRYPTION_KEY weak"])
      expect(JSON.stringify(issues({ ENCRYPTION_KEYS: "", ENCRYPTION_KEY: "too-short" }))).not.toContain("too-short")
    })

    it("turns both into warnings with ALLOW_PLAINTEXT_SECRETS=true", () => {
      expect(codes({ ENCRYPTION_KEYS: "", ALLOW_PLAINTEXT_SECRETS: "true" })).toEqual(["warning ENCRYPTION_KEY missing"])
      expect(codes({ ENCRYPTION_KEYS: "", ENCRYPTION_KEY: "too-short", ALLOW_PLAINTEXT_SECRETS: "true" })).toEqual([
        "warning ENCRYPTION_KEY weak",
      ])
    })
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
