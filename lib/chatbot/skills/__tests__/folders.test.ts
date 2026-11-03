/**
 * @jest-environment node
 */

import { assignFiles } from "../folders"

/** Every listed SKILL.md marks a folder, as the catalogue passes them. */
const assign = (docs: string[]) => assignFiles(docs, docs.filter((path) => path.split("/").at(-1) === "SKILL.md"))

describe("assignFiles", () => {
  it("keeps nested skill folders apart", () => {
    expect(assign(["a/SKILL.md", "a/x.md", "a/b/SKILL.md", "a/b/y.md"])).toEqual(
      new Map([
        ["a", ["x.md"]],
        ["a/b", ["y.md"]],
      ])
    )
  })

  it("matches whole path segments", () => {
    expect(assign(["a/SKILL.md", "ab/x.md"])).toEqual(new Map([["a", []]]))
  })

  it("treats a root SKILL.md as the root folder", () => {
    expect(assign(["SKILL.md", "guide.md", "docs/x.md"])).toEqual(new Map([["", ["docs/x.md", "guide.md"]]]))
  })

  it("keeps source.path in the folder", () => {
    expect(assign(["skills/SKILL.md", "skills/guide.md", "skills/docs/x.md", "skills/t/SKILL.md", "skills/t/n.md"])).toEqual(
      new Map([
        ["skills", ["docs/x.md", "guide.md"]],
        ["skills/t", ["n.md"]],
      ])
    )
  })
})
