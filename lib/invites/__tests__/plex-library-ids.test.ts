import { parsePlexLibrarySectionIds } from "@/lib/invites/plex-library-ids"

describe("parsePlexLibrarySectionIds", () => {
  it.each([
    [null, []],
    ["[]", []],
    ["[1,2]", [1, 2]],
  ] as const)("reads %p as %p", (raw, ids) => {
    expect(parsePlexLibrarySectionIds(raw)).toEqual(ids)
  })

  it.each(["not json", '["1"]', "[-1]", "[1.5]", '{"ids":[1]}'])("is null for %p", (raw) => {
    expect(parsePlexLibrarySectionIds(raw)).toBeNull()
  })
})
