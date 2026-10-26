/**
 * @jest-environment node
 */

import { docTitle, scoreDoc, searchTerms, snippets } from "../search"

describe("searchTerms", () => {
  it("lower-cases, drops one-letter words and repeats, and caps the count", () => {
    expect(searchTerms("Rewind a Rewind FAILED!")).toEqual(["rewind", "failed"])
    expect(searchTerms("a b c d e f g h i j k l m n o p q r")).toEqual([])
    expect(searchTerms("aa bb cc dd ee ff gg hh ii jj")).toHaveLength(8)
  })
})

describe("scoreDoc", () => {
  it("counts a path match five times a text match and 0 for no match", () => {
    expect(scoreDoc("runbooks/rewind.md", "", ["rewind"])).toBe(5)
    expect(scoreDoc("notes.md", "rewind failed, rewind again", ["rewind"])).toBe(2)
    expect(scoreDoc("notes.md", "nothing here", ["rewind"])).toBe(0)
  })

  it("caps the text count so one long file does not win on repetition", () => {
    expect(scoreDoc("a.md", "x ".repeat(100), ["x"])).toBe(10)
  })
})

describe("docTitle", () => {
  it("is the first heading, else the file name", () => {
    expect(docTitle("a/b.md", "intro\n## Fix the queue\n")).toBe("Fix the queue")
    expect(docTitle("a/b.md", "no heading")).toBe("b.md")
  })
})

describe("snippets", () => {
  it("returns up to two matching lines, cut short", () => {
    const text = ["# T", "Redis is down", "unrelated", `redis ${"x".repeat(400)}`, "redis again"].join("\n")
    const found = snippets(text, ["redis"])
    expect(found).toHaveLength(2)
    expect(found[0]).toBe("Redis is down")
    expect(found[1]).toHaveLength(300)
  })
})
