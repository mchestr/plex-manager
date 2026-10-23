/**
 * The browser side of SEC-31 and P11.1: when a settings form must ask for a
 * saved secret again, and what `describeSecret` tells it.
 */

import { needsSecretReentry, safeOrigin } from "@/lib/security/saved-secret"
import { describeSecret } from "@/lib/security/secret-reuse"

const saved = { last4: "5678", origin: "http://tautulli.lan:8181" }

describe("needsSecretReentry", () => {
  it("never blocks once something is typed", () => {
    expect(needsSecretReentry({ ...saved, unreadable: true }, null, "new-key")).toBe(false)
  })

  it("asks again for an unreadable secret, fixed destination or not", () => {
    expect(needsSecretReentry({ last4: "", origin: null, unreadable: true }, null, "")).toBe(true)
    expect(needsSecretReentry({ ...saved, unreadable: true }, saved.origin, " ")).toBe(true)
  })

  it("reuses a readable secret for its own origin or a fixed destination", () => {
    expect(needsSecretReentry(saved, "http://tautulli.lan:8181", "")).toBe(false)
    expect(needsSecretReentry({ last4: "", origin: null }, "https://elsewhere", "")).toBe(false)
    expect(needsSecretReentry(null, "https://elsewhere", "")).toBe(false)
  })

  it("asks again when the address moves", () => {
    expect(needsSecretReentry(saved, "http://listener.example:8181", "")).toBe(true)
    expect(needsSecretReentry(saved, null, "")).toBe(true)
  })
})

describe("safeOrigin", () => {
  it("is null for a blank address", () => {
    expect(safeOrigin(undefined)).toBeNull()
    expect(safeOrigin("  ")).toBeNull()
  })
})

describe("describeSecret", () => {
  it("marks an unreadable stored value, which the extension read as null", () => {
    expect(describeSecret(null, "http://tautulli.lan:8181/x", true)).toEqual({
      last4: "",
      origin: "http://tautulli.lan:8181",
      unreadable: true,
    })
    expect(describeSecret(null, undefined, true)).toEqual({ last4: "", origin: null, unreadable: true })
  })

  it("is null when nothing is stored", () => {
    expect(describeSecret(null, "http://tautulli.lan:8181")).toBeNull()
  })

  it("shows no last four for a short secret", () => {
    expect(describeSecret("short", undefined)).toEqual({ last4: "", origin: null })
  })
})
