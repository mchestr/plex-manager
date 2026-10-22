/**
 * Checks the @example blocks in lib/security/secret-reuse.ts, lib/security/saved-secret.ts,
 * lib/security/config-diff.ts, lib/security/rate-limit-messages.ts,
 * lib/security/safe-redirect.ts and lib/security/signed-cookie.ts.
 */

import { configDiff } from "@/lib/security/config-diff"
import { retryAfterCopy } from "@/lib/security/rate-limit-messages"
import { safeRedirectPath } from "@/lib/security/safe-redirect"
import { safeOrigin } from "@/lib/security/saved-secret"
import { describeSecret, resolveSecretForOrigin } from "@/lib/security/secret-reuse"
import { readCookie, signValue, verifyValue } from "@/lib/security/signed-cookie"

jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  getBaseUrl: () => "https://app.example.com",
}))

describe("JSDoc Documentation Examples", () => {
  it("describeSecret", () => {
    expect(describeSecret("abcdefgh12345678", "http://tautulli.lan:8181/x")).toEqual({ last4: "5678", origin: "http://tautulli.lan:8181" })
    expect(describeSecret("", "http://tautulli.lan:8181")).toBeNull()
  })

  it("safeOrigin", () => {
    expect(safeOrigin("http://Tautulli.lan:8181/api")).toBe("http://tautulli.lan:8181")
    expect(safeOrigin("https://plex.example.com:443")).toBe("https://plex.example.com")
    expect(safeOrigin("not a url")).toBeNull()
  })

  it("resolveSecretForOrigin refuses a stored key for a new host", () => {
    expect(
      resolveSecretForOrigin({
        submitted: "",
        stored: { secret: "k", url: "http://tautulli.lan:8181" },
        submittedUrl: "http://evil.example:8181",
      })
    ).toEqual({ ok: false, code: "SECRET_REQUIRED" })
  })

  it("configDiff keeps field names and origins only", () => {
    expect(
      configDiff(
        "tautulli",
        { url: "http://old.lan:8181/x", apiKey: "k1" },
        { url: "https://new.lan/y?z=1", apiKey: "k1" },
        { secretFields: ["apiKey"], urlFields: ["url"] }
      )
    ).toEqual({
      section: "tautulli",
      changedFields: ["url"],
      secretChanged: false,
      origins: { before: { url: "http://old.lan:8181" }, after: { url: "https://new.lan" } },
    })
  })

  it("retryAfterCopy names when to try again", () => {
    expect(retryAfterCopy(30)).toBe("in 1 minute")
    expect(retryAfterCopy(3 * 3600 + 300)).toBe("in 3 hours, 5 minutes")
  })

  it("safeRedirectPath keeps allow-listed paths and refuses bypasses", () => {
    expect(safeRedirectPath("/discord/link?x=1")).toBe("/discord/link?x=1")
    expect(safeRedirectPath("/%5Cevil.com")).toBe("/discord/link")
    expect(safeRedirectPath("/admin", "/")).toBe("/")
  })

  it("signValue verifies only for its own purpose, and readCookie parses a raw header", () => {
    const raw = signValue({ pinId: 42 }, "plex-pin", 900)
    expect(verifyValue(raw, "plex-pin")).toEqual({ pinId: 42 })
    expect(verifyValue(raw, "discord-oauth")).toBeNull()
    expect(readCookie("a=1; pm-plex-pin=abc", "pm-plex-pin")).toBe("abc")
  })
})
