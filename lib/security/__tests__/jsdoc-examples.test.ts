/**
 * Checks the @example blocks in lib/security/secret-reuse.ts and
 * lib/security/config-diff.ts.
 */

import { configDiff } from "@/lib/security/config-diff"
import { resolveSecretForOrigin } from "@/lib/security/secret-reuse"

describe("JSDoc Documentation Examples", () => {
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
})
