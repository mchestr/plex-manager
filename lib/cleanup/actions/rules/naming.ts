/**
 * Rule names and the rule limit (UX 4.2.2 item 2, TS 10.2, 10.3 create step
 * 4, 17.2): a new rule takes its name, or the name with " 2", " 3" and so on
 * when it exists. A copy is "{name} copy", then " 2". A name stays within
 * the 80 characters of `ruleNameSchema`. Server-only.
 *
 * @module lib/cleanup/actions/rules/naming
 */

import "server-only"

import { RULE_LIMIT } from "@/lib/cleanup/actions/rules/result"
import { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

/** The longest rule name (`ruleNameSchema`). */
const RULE_NAME_MAX = 80

/** `base` cut so that `suffix` fits after it within {@link RULE_NAME_MAX}. */
const fit = (base: string, suffix = "") => `${base.slice(0, RULE_NAME_MAX - suffix.length).trimEnd()}${suffix}`

/** The first free name of `base`, `base 2`, `base 3`, ... among `taken`. */
export function freeName(base: string, taken: ReadonlySet<string>): string {
  const first = fit(base.trim())
  if (!taken.has(first)) return first
  for (let n = 2; ; n += 1) {
    const name = fit(first, ` ${n}`)
    if (!taken.has(name)) return name
  }
}

/** The name of a copy (TS 10.2 `duplicateCleanupRule`): "{name} copy", then "{name} copy 2". */
export const copyName = (name: string, taken: ReadonlySet<string>): string => freeName(fit(name, " copy"), taken)

/** Every rule name. A server holds at most {@link RULE_LIMIT} rules, so this is one small query. */
export async function ruleNames(): Promise<Set<string>> {
  const rows = await prisma.cleanupRule.findMany({ select: { name: true } })
  return new Set(rows.map((row) => row.name))
}

/** True when the server holds {@link RULE_LIMIT} rules or more. */
export const atRuleLimit = (names: ReadonlySet<string>): boolean => names.size >= RULE_LIMIT

/**
 * A unique error of a rule write: two creates or a rename took the same name
 * at once. The name is the only unique column that a rule write sets (the id
 * is a new cuid).
 */
export function isNameTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
