import "server-only"

/**
 * The SKILLS section of the admin assistant's system prompt. The catalogue's
 * prompt budget measures exactly this text, so what fits is what is shown.
 *
 * A description comes from a skill repository and sits in the prompt outside
 * any tool-data wrapper, so each one is flattened to a single line that cannot
 * pose as a section header or a second skill line.
 *
 * @module lib/chatbot/skills/prompt
 */

const MAX_DESCRIPTION_CHARS = 300

export const SKILLS_HEADER =
  "=== SKILLS ===\n\n" +
  "Skills are instructions an administrator wrote for recurring tasks.\n" +
  "When a request matches a skill, call load_skill with its name first and follow it.\n"

/**
 * One line of at most 300 characters: whitespace and control characters
 * become spaces, format characters (`\p{Cf}`, such as zero-width spaces) go,
 * and each run of three or more `=` becomes a space, so it cannot imitate a
 * `=== HEADER ===`. Collapsing whitespace comes last, so no double space is
 * left behind.
 * @internal
 */
export function promptDescription(description: string): string {
  const line = description
    .replace(/[\s\p{Cc}]/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/={3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  // A high surrogate left last by the cut lost its pair; a lone surrogate is not valid Unicode for the provider
  return line.slice(0, MAX_DESCRIPTION_CHARS).replace(/[\uD800-\uDBFF]$/, "")
}

/** `- name: description`, as the prompt lists a skill. */
export function skillLine(name: string, description: string): string {
  return `- ${name}: ${promptDescription(description)}`
}

/** The section for these skills, in order, or `null` when there are none. */
export function skillsSection(skills: { name: string; description: string }[]): string | null {
  if (skills.length === 0) return null
  return SKILLS_HEADER + skills.map((skill) => skillLine(skill.name, skill.description)).join("\n")
}
