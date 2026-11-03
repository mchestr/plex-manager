import "server-only"

import { parse } from "yaml"
import { z } from "zod"

/**
 * Parses an Agent Skills `SKILL.md`: YAML frontmatter between two `---` lines,
 * holding `name` and `description`, then the Markdown body.
 *
 * The file comes from a repository, so the parse is defensive. A BOM is
 * dropped and CRLF becomes LF; the frontmatter is at most 4,096 characters;
 * aliases are refused (`maxAliasCount: 0`, which also rules out merge keys),
 * and so are repeated keys; an unknown tag such as `!!js/function` stays a
 * plain string, with no process warning. A failure is `{ ok: false, reason }`,
 * never a throw.
 *
 * @module lib/chatbot/skills/frontmatter
 */

const MAX_FRONTMATTER_CHARS = 4_096
/** `---`, the frontmatter (possibly empty), then `---` alone on a line, before the body or at the end. */
const FRONTMATTER = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/

const frontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  description: z
    .string()
    .transform((text) => text.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(1_024)),
})

const FIELD_REASONS: Record<string, string> = {
  name: "The name must be 1 to 64 lowercase letters, digits and hyphens, starting with a letter or digit",
  description: "The description must be 1 to 1,024 characters",
}

type ParsedSkill = { ok: true; name: string; description: string; body: string } | { ok: false; reason: string }

/** The skill's `name`, its `description` collapsed to one line, and the body after the frontmatter. */
export function parseSkillMarkdown(text: string): ParsedSkill {
  const normalised = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const match = FRONTMATTER.exec(normalised)
  if (!match) return { ok: false, reason: "No frontmatter: the file must start with a --- line and close it with another" }
  const front = match[1] ?? ""
  if (front.length > MAX_FRONTMATTER_CHARS) return { ok: false, reason: "The frontmatter is longer than 4,096 characters" }

  let data: unknown
  try {
    data = parse(front, { maxAliasCount: 0, logLevel: "error" })
  } catch {
    // Any error, not only YAMLError: the alias guard throws a ReferenceError
    return { ok: false, reason: "The frontmatter is not valid YAML, or uses an alias or a repeated key" }
  }

  const parsed = frontmatterSchema.safeParse(data)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]
    return { ok: false, reason: (typeof field === "string" && FIELD_REASONS[field]) || "The frontmatter must be a mapping with a name and a description" }
  }
  return { ok: true, name: parsed.data.name, description: parsed.data.description, body: normalised.slice(match[0].length) }
}
