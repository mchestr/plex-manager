/**
 * The table of the Kept and excluded tab (UX 4.8, 12.6 item 1): the member
 * Keeps and the admin exclusions that protect now, newest first. Keep
 * forever marks are not listed: members own them on Account (UX 4.8 item 2).
 * Client-safe: the query and the row shape only.
 *
 * A row names the member who kept the title or the admin who excluded it.
 * Only an exclusion carries its note: notes are admin data (TS 2.2).
 *
 * @module lib/cleanup/screens/protections/rows
 */

import { itemRefOf } from "@/lib/cleanup/screens/leaving/item-ref"
import type { ProtectionsParams } from "@/lib/cleanup/screens/leaving/params"
import type { People } from "@/lib/cleanup/screens/leaving/people"
import type { ProtectionRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupProtection, Prisma } from "@/lib/generated/prisma/client"

const KIND_OF = { keep: "memberKeep", exclude: "adminExclude" } as const

/** The rows that protect at `now` (`active`), with the kind and search filters. */
export function protectionsWhere(params: Pick<ProtectionsParams, "q" | "kind">, active: Prisma.CleanupProtectionWhereInput) {
  const and: Prisma.CleanupProtectionWhereInput[] = [active, { kind: { in: params.kind ? [KIND_OF[params.kind]] : Object.values(KIND_OF) } }]
  if (params.q) and.push({ title: { contains: params.q, mode: "insensitive" } })
  return { AND: and } satisfies Prisma.CleanupProtectionWhereInput
}

/** Newest first; the id breaks ties so pages never overlap. */
export const PROTECTIONS_ORDER: Prisma.CleanupProtectionOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "asc" }]

/** The person a row names: the member of a Keep, the admin who made an exclusion. */
export const personIdOf = (row: Pick<CleanupProtection, "kind" | "memberId" | "createdBy">): string | null =>
  row.kind === "memberKeep" ? row.memberId : row.createdBy

/** One table row. */
export function protectionRow(row: CleanupProtection, people: People): ProtectionRow {
  const keep = row.kind === "memberKeep"
  return {
    ...itemRefOf(row),
    id: row.id,
    kind: keep ? "keep" : "exclude",
    by: people.ref(personIdOf(row)),
    until: row.expiresAt?.toISOString() ?? null,
    since: row.createdAt.toISOString(),
    note: keep ? null : row.note,
  }
}
