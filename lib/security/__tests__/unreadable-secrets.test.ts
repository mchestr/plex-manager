/**
 * The in-memory record of secrets this process could not decrypt (P11.1).
 */

import {
  clearUnreadable,
  isUnreadable,
  listUnreadable,
  markUnreadable,
  resetUnreadable,
} from "@/lib/security/unreadable-secrets"

beforeEach(() => resetUnreadable())

describe("unreadable secrets", () => {
  it("records a row's field and lists it once per model and field", () => {
    markUnreadable("Tautulli", "apiKey", "t1", "old", "KEY_UNKNOWN")
    markUnreadable("Tautulli", "apiKey", "t2", "old", "KEY_UNKNOWN")

    expect(isUnreadable("Tautulli", "apiKey", "t1")).toBe(true)
    expect(isUnreadable("Tautulli", "apiKey", "t3")).toBe(false)
    expect(isUnreadable("Sonarr", "apiKey", "t1")).toBe(false)
    expect(listUnreadable()).toEqual([{ model: "Tautulli", field: "apiKey", kid: "old", code: "KEY_UNKNOWN", rows: 2 }])
  })

  it("counts a read without the row id as one row, and not on top of the ids", () => {
    markUnreadable("Config", "stripeSecretKey", undefined, null, "CORRUPT")
    expect(isUnreadable("Config", "stripeSecretKey", undefined)).toBe(true)
    expect(listUnreadable()[0].rows).toBe(1)

    markUnreadable("Config", "stripeSecretKey", "config", null, "CORRUPT")
    expect(listUnreadable()[0].rows).toBe(1)
  })

  it("forgets a row once it decrypts, and the field once no row is left", () => {
    markUnreadable("User", "plexAuthToken", "u1", "k1", "KEY_MISSING")
    markUnreadable("User", "plexAuthToken", "u2", "k1", "KEY_MISSING")

    clearUnreadable("User", "plexAuthToken", "u1")
    expect(isUnreadable("User", "plexAuthToken", "u1")).toBe(false)
    expect(listUnreadable()[0].rows).toBe(1)

    clearUnreadable("User", "plexAuthToken", "u2")
    expect(listUnreadable()).toEqual([])
  })

  it("ignores a clear for a field that never failed", () => {
    clearUnreadable("Radarr", "apiKey", "r1")
    expect(listUnreadable()).toEqual([])
  })
})
