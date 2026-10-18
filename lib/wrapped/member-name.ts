/**
 * The member's name as it may appear in a Rewind or an LLM prompt: the
 * trimmed name, or null when it is empty or looks like an email address.
 * Callers pick the fallback ("there" in the prompt), so an email never
 * stands in for a name.
 *
 * @example
 * ```ts
 * memberName({ name: "  Mike " })         // "Mike"
 * memberName({ name: "mike@example.com" }) // null
 * memberName({ name: null })               // null
 * ```
 */
export function memberName(user: { name: string | null }): string | null {
  const name = user.name?.trim()
  if (!name || name.includes("@")) return null
  return name
}
