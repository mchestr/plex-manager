/**
 * Tests for resolveSecretForOrigin (P4.6, SEC-31): a blank secret is reused
 * only for the origin it was stored with.
 */

import { resolveSecretForOrigin } from "@/lib/security/secret-reuse"

const stored = { secret: "stored-key", url: "http://tautulli.lan:8181" }

describe("resolveSecretForOrigin", () => {
  it("reuses the stored secret for the same origin with a different path", () => {
    expect(
      resolveSecretForOrigin({ submitted: "", stored, submittedUrl: "http://tautulli.lan:8181/tautulli" })
    ).toEqual({ ok: true, secret: "stored-key", reused: true })
  })

  it.each([
    ["host", "http://listener.example:8181"],
    ["port", "http://tautulli.lan:9999"],
    ["scheme", "https://tautulli.lan:8181"],
  ])("requires the secret again after a change of %s", (_change, submittedUrl) => {
    expect(resolveSecretForOrigin({ submitted: undefined, stored, submittedUrl })).toEqual({
      ok: false,
      code: "SECRET_REQUIRED",
    })
  })

  it("treats a default port as the same origin", () => {
    const https = { secret: "k", url: "https://a" }
    expect(resolveSecretForOrigin({ submitted: "  ", stored: https, submittedUrl: "https://a:443" })).toMatchObject({
      ok: true,
      reused: true,
    })
    expect(
      resolveSecretForOrigin({ submitted: "", stored: { secret: "k", url: "http://a:80/x" }, submittedUrl: "http://a" })
    ).toMatchObject({ ok: true, reused: true })
  })

  it("compares host names case-insensitively", () => {
    expect(
      resolveSecretForOrigin({ submitted: "", stored, submittedUrl: "http://TAUTULLI.lan:8181" })
    ).toMatchObject({ ok: true })
  })

  it("always uses a submitted secret, trimmed", () => {
    expect(
      resolveSecretForOrigin({ submitted: " new-key ", stored, submittedUrl: "http://listener.example" })
    ).toEqual({ ok: true, secret: "new-key", reused: false })
  })

  it("requires a secret when nothing is stored", () => {
    expect(resolveSecretForOrigin({ submitted: "", stored: null, submittedUrl: "http://a" })).toEqual({
      ok: false,
      code: "SECRET_REQUIRED",
    })
    expect(
      resolveSecretForOrigin({ submitted: "", stored: { secret: "", url: "http://a" }, submittedUrl: "http://a" })
    ).toEqual({ ok: false, code: "SECRET_REQUIRED" })
  })

  it("refuses an unparseable URL", () => {
    expect(resolveSecretForOrigin({ submitted: "", stored, submittedUrl: "ftp://tautulli.lan:8181" })).toEqual({
      ok: false,
      code: "SECRET_REQUIRED",
    })
  })
})
