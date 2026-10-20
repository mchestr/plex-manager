import { safeReturnPath } from "@/lib/rewind/return-to"

describe("safeReturnPath", () => {
  it.each(["/", "/account", "/rewind/2025?sheet=share", "/admin/users/abc"])("keeps %s", (path) => {
    expect(safeReturnPath(path)).toBe(path)
  })

  it.each(["//evil.example", "/\\evil", "https://x", "", "account", "javascript:alert(1)", "/a\\b"])(
    "sends %j home",
    (raw) => {
      expect(safeReturnPath(raw)).toBe("/")
    }
  )

  it("sends a missing value home", () => {
    expect(safeReturnPath(undefined)).toBe("/")
    expect(safeReturnPath(null)).toBe("/")
  })

  it("matches the JSDoc examples", () => {
    expect(safeReturnPath("/account")).toBe("/account")
    expect(safeReturnPath("//evil.example")).toBe("/")
    expect(safeReturnPath("https://x")).toBe("/")
  })
})
