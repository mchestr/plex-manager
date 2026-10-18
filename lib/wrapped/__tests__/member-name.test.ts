import { memberName } from "@/lib/wrapped/member-name"

describe("memberName", () => {
  it.each([
    ["Mike", "Mike"],
    ["  Mike  ", "Mike"],
    ["Mike O'Brien", "Mike O'Brien"],
  ])("returns the trimmed name for %j", (name, expected) => {
    expect(memberName({ name })).toBe(expected)
  })

  it.each([
    ["a null name", null],
    ["an empty name", ""],
    ["a blank name", "   "],
    ["an email", "mike@example.com"],
    ["a name containing @", "mike @ home"],
  ])("returns null for %s", (_label, name) => {
    expect(memberName({ name })).toBeNull()
  })

  it("matches the documented examples", () => {
    expect(memberName({ name: "  Mike " })).toBe("Mike")
    expect(memberName({ name: "mike@example.com" })).toBeNull()
    expect(memberName({ name: null })).toBeNull()
  })
})
