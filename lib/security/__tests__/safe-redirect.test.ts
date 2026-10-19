/**
 * @jest-environment node
 */

import { safeRedirectPath } from "@/lib/security/safe-redirect"

jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://app.example.com" }))

describe("safeRedirectPath", () => {
  it.each([
    "/\\evil.com",
    "/\\\\evil.com",
    "/\t/evil.com",
    "/%5Cevil.com",
    "/%5cevil.com",
    "//evil.com",
    "/%2F%2Fevil.com",
    "/%2f%2fevil.com",
    "/%09/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/%0d%0aSet-Cookie:x",
    "/discord/link%0d%0aSet-Cookie:x",
    "/discord/link\r\nSet-Cookie:x",
    "/discord/link?x=%00",
    "/discord/../admin",
    "evil.com",
    "",
  ])("falls back for %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/discord/link")
  })

  it("falls back for a missing value", () => {
    expect(safeRedirectPath(undefined)).toBe("/discord/link")
    expect(safeRedirectPath(null)).toBe("/discord/link")
  })

  it("keeps an allow-listed path with its query and drops the hash", () => {
    expect(safeRedirectPath("/discord/link?x=1")).toBe("/discord/link?x=1")
    expect(safeRedirectPath("/onboarding#step")).toBe("/onboarding")
    expect(safeRedirectPath("/account")).toBe("/account")
    expect(safeRedirectPath("/")).toBe("/")
  })

  it("sends a path off the allow-list to the fallback", () => {
    expect(safeRedirectPath("/admin")).toBe("/discord/link")
    expect(safeRedirectPath("/admin", "/")).toBe("/")
    expect(safeRedirectPath("/wrapped")).toBe("/discord/link")
  })
})
