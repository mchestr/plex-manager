import { actGroups } from "../acts"

describe("actGroups (P7.4)", () => {
  it("groups the selected pages by act and skips empty acts (the JSDoc example)", () => {
    expect(actGroups(["cover", "number", "top-shows", "centrefold", "back-cover"]).map((g) => [g.label, g.pages])).toEqual([
      ["Front", [0, 1]],
      ["Features", [2]],
      ["Centrefold", [3]],
      ["Back", [4]],
    ])
  })

  it("lists all six acts on a full issue, in issue order", () => {
    const groups = actGroups(["cover", "number", "guess", "top-shows", "clock", "setup", "standing", "centrefold", "next-year", "back-cover"])
    expect(groups.map((g) => g.act)).toEqual(["front", "features", "habits", "server", "centrefold", "back"])
    expect(groups.find((g) => g.act === "server")!.pages).toEqual([5, 6])
  })
})
