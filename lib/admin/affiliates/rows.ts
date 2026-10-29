/**
 * The admin Affiliates page's rows, built from loaded data. Pure, so the
 * loaders in `lib/data/affiliates.ts` stay thin and the counting is tested
 * without a database.
 *
 * - **Slots used**: joins in the last 30 days plus open invites (not used,
 *   not cancelled, not expired). The allowance is per rolling 30 days.
 * - **State**: `paid` while a subscription is ACTIVE or PAST_DUE (paused),
 *   `override_zero` while the override is 0 (paused), else `active`.
 * - **Invite tree**: an affiliate's invitees, nested where an invitee also
 *   invited people. A removed invitee has no id and shows as a removed member;
 *   the joins of a removed affiliate sit under one root with no id.
 *
 * @module lib/admin/affiliates/rows
 */

import type { Allowance } from "@/lib/affiliates/tiers"

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

export interface AffiliateInviteFacts {
  expiresAt: Date | null
  cancelledAt: Date | null
  joinedAt: Date | null
}

/** An invite with its code and label, which only an admin's read loads. */
export interface LabelledInviteFacts extends AffiliateInviteFacts {
  id: string
  code: string
  label: string | null
}

export interface InviteCounts {
  slotsUsed: number
  totalJoins: number
  expiredUnused: number
}

const isOpen = (invite: AffiliateInviteFacts, now: Date) =>
  !invite.joinedAt && !invite.cancelledAt && !!invite.expiresAt && invite.expiresAt > now

/** The counts the Affiliates tab shows for one affiliate's invites. */
export function countInvites(invites: readonly AffiliateInviteFacts[], now: Date): InviteCounts {
  const since = now.getTime() - MONTH_MS
  let joinedRecently = 0
  let open = 0
  let totalJoins = 0
  let expiredUnused = 0
  for (const invite of invites) {
    if (invite.joinedAt) {
      totalJoins++
      if (invite.joinedAt.getTime() > since) joinedRecently++
    } else if (isOpen(invite, now)) {
      open++
    } else if (!invite.cancelledAt && invite.expiresAt && invite.expiresAt.getTime() > since) {
      expiredUnused++
    }
  }
  return { slotsUsed: joinedRecently + open, totalJoins, expiredUnused }
}

export interface OpenInvite {
  id: string
  label: string | null
  expiresAt: Date
  /** The last 4 characters of the code; never the whole code. */
  codeEnd: string
}

/** The affiliate's open invites, for admins only. */
export function openInvites(invites: readonly LabelledInviteFacts[], now: Date): OpenInvite[] {
  return invites
    .filter((invite) => isOpen(invite, now))
    .map((invite) => ({ id: invite.id, label: invite.label, expiresAt: invite.expiresAt!, codeEnd: invite.code.slice(-4) }))
}

export type AffiliateState = "active" | "paid" | "override_zero"

export function affiliateState(paid: boolean, allowance: Allowance): AffiliateState {
  if (paid) return "paid"
  if (allowance.source === "override" && allowance.invites === 0) return "override_zero"
  return "active"
}

export interface JoinEdge {
  /** Null once the affiliate was removed. */
  affiliateUserId: string | null
  /** Null once the invitee was removed. */
  joinedUserId: string | null
  joinedAt: Date
}

export interface TreeNode {
  /** Null for a removed member. */
  userId: string | null
  name: string | null
  joinedAt: Date | null
  children: TreeNode[]
}

/**
 * The invite tree: every member who invited someone, with their invitees,
 * nested where an invitee also invited people. A root is an inviter whom no
 * other inviter in the tree invited; the joins of removed affiliates share one
 * last root with no id.
 */
export function buildInviteTree(edges: readonly JoinEdge[], names: ReadonlyMap<string, string>): TreeNode[] {
  const byInviter = new Map<string | null, JoinEdge[]>()
  for (const edge of edges) byInviter.set(edge.affiliateUserId, [...(byInviter.get(edge.affiliateUserId) ?? []), edge])
  const invited = new Set(edges.flatMap((edge) => (edge.joinedUserId ? [edge.joinedUserId] : [])))

  const childrenOf = (inviter: string | null, path: ReadonlySet<string>): TreeNode[] =>
    (byInviter.get(inviter) ?? [])
      .toSorted((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((edge) =>
        edge.joinedUserId && !path.has(edge.joinedUserId)
          ? node(edge.joinedUserId, edge.joinedAt, path)
          : { userId: null, name: null, joinedAt: edge.joinedAt, children: [] }
      )

  const node = (userId: string, joinedAt: Date | null, seen: ReadonlySet<string>): TreeNode => {
    const path = new Set(seen).add(userId)
    return { userId, name: names.get(userId) ?? null, joinedAt, children: childrenOf(userId, path) }
  }

  const roots = [...byInviter.keys()]
    .filter((userId): userId is string => userId !== null && !invited.has(userId))
    .map((userId) => node(userId, null, new Set()))
    .toSorted((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
  return byInviter.has(null) ? [...roots, { userId: null, name: null, joinedAt: null, children: childrenOf(null, new Set()) }] : roots
}
