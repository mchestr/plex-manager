/**
 * @jest-environment node
 */

import { parseSkillMarkdown } from "../frontmatter"

const VALID = "---\nname: triage-rewind\ndescription: Triage a failed Rewind\n---\n# Steps\n1. Look"
const PARSED = { ok: true, name: "triage-rewind", description: "Triage a failed Rewind", body: "# Steps\n1. Look" }

const skill = (front: string, body = "body") => `---\n${front}\n---\n${body}`
const refused = { ok: false, reason: expect.any(String) }

describe("parseSkillMarkdown", () => {
  it("parses a valid skill", () => {
    expect(parseSkillMarkdown(VALID)).toEqual(PARSED)
  })

  it("parses CRLF and BOM frontmatter", () => {
    expect(parseSkillMarkdown(`\uFEFF${VALID.replace(/\n/g, "\r\n")}`)).toEqual(PARSED)
  })

  it("parses folded and quoted descriptions", () => {
    expect(parseSkillMarkdown(skill("name: x\ndescription: >-\n  Line one\n  line two"))).toMatchObject({ ok: true, description: "Line one line two" })
    expect(parseSkillMarkdown(skill('name: x\ndescription: "a: b"'))).toMatchObject({ ok: true, description: "a: b" })
  })

  it("accepts a frontmatter that ends the file", () => {
    expect(parseSkillMarkdown("---\nname: x\ndescription: y\n---")).toEqual({ ok: true, name: "x", description: "y", body: "" })
  })

  it("refuses an empty frontmatter", () => {
    expect(parseSkillMarkdown("---\n---\n# Body")).toEqual({ ok: false, reason: "The frontmatter must be a mapping with a name and a description" })
  })

  it("rejects bad names and descriptions", () => {
    expect(parseSkillMarkdown(skill("name: Triage_Rewind\ndescription: ok"))).toEqual(refused)
    expect(parseSkillMarkdown(skill(`name: ${"a".repeat(65)}\ndescription: ok`))).toEqual(refused)
    expect(parseSkillMarkdown(skill('name: triage\ndescription: ""'))).toEqual(refused)
    expect(parseSkillMarkdown(skill(`name: triage\ndescription: ${"d".repeat(1025)}`))).toEqual(refused)
  })

  it("measures a description after collapsing its whitespace", () => {
    expect(parseSkillMarkdown(skill(`name: x\ndescription: "${"d".repeat(1024)}   "`))).toMatchObject({ ok: true, description: "d".repeat(1024) })
    expect(parseSkillMarkdown(skill('name: x\ndescription: "  "'))).toEqual(refused)
  })

  it("reports hostile frontmatter", () => {
    const emitWarning = jest.spyOn(process, "emitWarning").mockImplementation(() => undefined)
    const hostile = [
      "# No frontmatter\n\nname: triage-rewind",
      skill("- a"),
      // Valid without the alias guard: both values would be "triage-rewind"
      skill("name: &n triage-rewind\ndescription: *n"),
      skill("base: &b {a: 1}\nname: x\ndescription: y\nz:\n  <<: *b"),
      skill("name: a\nname: b\ndescription: y"),
      skill(`name: x\ndescription: y\nnotes: ${"n".repeat(4_096)}`),
    ]

    for (const text of hostile) expect(parseSkillMarkdown(text)).toEqual(refused)
    expect(parseSkillMarkdown(skill('name: x\ndescription: !!js/function "x"'))).toMatchObject({ ok: true, description: "x" })
    expect(emitWarning).not.toHaveBeenCalled()
    emitWarning.mockRestore()
  })
})
