import type { Prisma } from "@/lib/generated/prisma/client"

/**
 * The User fields that may be sent to the browser when a user is read through
 * a relation (for example, the members who redeemed an invite).
 *
 * Nested relation reads bypass the encryption extension in `lib/prisma.ts`, so
 * `include: { user: true }` would ship every User column, `plexAuthToken`
 * included, to the client. Select these fields instead.
 */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>

/** An invite with its redemptions, each carrying only the public user fields. */
export type InviteWithUsages = Prisma.InviteGetPayload<{
  include: { usages: { include: { user: { select: typeof publicUserSelect } } } }
}>
