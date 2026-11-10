/**
 * The people that the list tabs name: the admin who paused cleanup or
 * postponed a title, the member who kept a title, the admin who excluded or
 * approved one, and the admin who started a run. One query reads every name
 * of a render. Server-only: names are admin data.
 *
 * A user row that is gone reads "Unknown member", as the other admin pages
 * read it.
 *
 * @module lib/cleanup/screens/leaving/people
 */

import "server-only"

import type { PersonRef } from "@/lib/cleanup/types/rule-parts"
import { prisma } from "@/lib/prisma"

/** The name of a user with no row, or with no name and no email. */
const UNKNOWN_PERSON = "Unknown member"

export interface People {
  /** The person of a user id, or null for no id. */
  ref(userId: string | null | undefined): PersonRef | null
  /** "you" for the viewer, else the name, or null for no id ("To {day} by {name}"). */
  words(userId: string | null | undefined): string | null
}

/** Reads the names of `userIds` once. `viewerId` reads as "you". */
export async function readPeople(userIds: Iterable<string | null | undefined>, viewerId: string): Promise<People> {
  const ids = [...new Set([...userIds].filter((id): id is string => typeof id === "string" && id.length > 0))]
  const rows = ids.length === 0 ? [] : await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
  const names = new Map(rows.map((row) => [row.id, row.name || row.email || UNKNOWN_PERSON]))
  const ref = (userId: string | null | undefined): PersonRef | null =>
    userId ? { id: userId, name: names.get(userId) ?? UNKNOWN_PERSON, isYou: userId === viewerId } : null
  return {
    ref,
    words: (userId) => {
      const person = ref(userId)
      return person === null ? null : person.isYou ? "you" : person.name
    },
  }
}
