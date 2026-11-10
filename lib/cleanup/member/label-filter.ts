/**
 * The share filter text of one library section, read the way media cleanup
 * accepts it (TS 13.1 rule 3). Pure and client-safe.
 *
 * plex.tv stores a filter as clauses joined by `|`, each with its value list
 * joined by `%2C` (`label!=A%2CB`). `filtersOf()` joins `filterAll` and the
 * filter of the section's type with `|` too, so both pass through the same
 * steps and their labels add up (rule 5):
 *
 * 1. Split the text on `|`.
 * 2. URL-decode each clause. A clause that does not decode hides the section.
 * 3. Accept the filter only when every clause starts with `label!=`.
 * 4. Split each clause's values on `,`, trim them and lower-case them. Plex
 *    compares labels without case, and the snapshot stores them in lower case.
 *    A clause with no value is not a form this server uses, so it hides the
 *    section too.
 *
 * Any other form (`label=A`, `contentRating=PG`, a mix) hides the section,
 * as the poster route does for every filter.
 *
 * @module lib/cleanup/member/label-filter
 */

const LABEL_NOT = "label!="

function decoded(clause: string): string | null {
  try {
    return decodeURIComponent(clause).trim()
  } catch {
    return null
  }
}

/**
 * The labels that a `label!=A,B` filter hides, or `null` when the section
 * must be hidden (another filter form).
 *
 * @example
 * ```ts
 * parseLabelFilter("label!=A%2CB") // Set { "a", "b" }
 * parseLabelFilter("label!=Untranscodable") // Set { "untranscodable" }
 * parseLabelFilter("label!=A|contentRating=PG") // null
 * ```
 */
export function parseLabelFilter(text: string): ReadonlySet<string> | null {
  const labels = new Set<string>()
  for (const raw of text.split("|")) {
    const clause = decoded(raw)
    if (clause === null || !clause.startsWith(LABEL_NOT)) return null
    const values = clause
      .slice(LABEL_NOT.length)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
    if (values.length === 0) return null
    for (const value of values) labels.add(value)
  }
  return labels
}
