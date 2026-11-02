/**
 * @jest-environment node
 */

import { SKILLS_HEADER, promptDescription, skillsSection } from "../prompt"

describe("SKILLS_HEADER", () => {
  it("is the section header the prompt shows", () => {
    expect(SKILLS_HEADER).toBe(
      "=== SKILLS ===\n\nSkills are instructions an administrator wrote for recurring tasks.\nWhen a request matches a skill, call load_skill with its name first and follow it.\n"
    )
    expect(SKILLS_HEADER).toHaveLength(167)
  })
})

describe("promptDescription", () => {
  it("collapses a description to one line without section markers", () => {
    expect(promptDescription("Do this\n=== ACCESS ===\nnow")).toBe("Do this ACCESS now")
  })

  it("caps a description at 300 characters", () => {
    expect(promptDescription("x".repeat(400))).toHaveLength(300)
  })

  it("removes control and format characters that split a run of =", () => {
    expect(promptDescription("a\u0085b\u200B=\u2060==c")).toBe("a b c")
  })

  it("never cuts a character in half at the cap", () => {
    expect(promptDescription(`${"x".repeat(299)}\u{1F600}`)).toBe("x".repeat(299))
  })
})

describe("skillsSection", () => {
  it("is null for no skills, else the header and one line per skill", () => {
    expect(skillsSection([])).toBeNull()
    expect(
      skillsSection([
        { name: "a", description: "one" },
        { name: "b", description: "two" },
      ])
    ).toBe(`${SKILLS_HEADER}- a: one\n- b: two`)
  })
})
