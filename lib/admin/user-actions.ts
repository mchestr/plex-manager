/**
 * Which actions an admin may take on one member (P10.18), shared by the users
 * list's row menu and the user detail header so both offer the same items in
 * the same order. Pure, so the client menus call it.
 *
 * ## Order and rules
 *
 * | Id             | Shown when                                                    |
 * |----------------|---------------------------------------------------------------|
 * | `view`         | in the users list (`inList`)                                  |
 * | `rewind`       | in the users list: the season year's Rewind                   |
 * | `regenerate`   | `canRegenerate` (missing, finished, or stuck past 15 minutes) |
 * | `role`         | not the owner                                                 |
 * | `grant`        | Stripe on, not an admin, not exempt                           |
 * | `exempt`       | Stripe on, not an admin                                       |
 * | `cancel`       | Stripe on, subscription `ACTIVE` or `PAST_DUE`                |
 * | `stripe`       | Stripe on, a customer id and a dashboard URL                  |
 * | `disable`      | not the owner                                                 |
 * | `removeAccess` | not an admin, has a Plex account, access not `notShared`      |
 *
 * `disable` and `removeAccess` are the destructive pair the menu puts last.
 * An `unknown` access still offers removal: the action asks Plex itself and
 * reports inside its dialog when Plex doesn't answer.
 *
 * @module lib/admin/user-actions
 */

import { canRegenerate } from "@/lib/admin/can-regenerate"
import { type PlexAccess, plexAccessOf } from "@/lib/admin/users-filter"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import type { AdminUserWithWrappedStats } from "@/types/admin"
import type { AuthService } from "@/types/onboarding"

/** What the actions and their dialogs need to know about a member. */
export interface UserActionTarget {
  id: string
  /** The display name the dialogs name: "Remove Plex access for Morgan Lee?" */
  name: string
  plexUserId: string | null
  /** Every linked media server, which the grant and cancel dialogs name (P11.11). */
  services: AuthService[]
  isAdmin: boolean
  isOwner: boolean
  disabled: boolean
  plexAccess: PlexAccess
  wrappedStatus: string | null
  wrappedRunStartedAt: Date | string | null
  subscriptionStatus: SubscriptionStatus | null
  isExempt: boolean
  stripeCustomerId: string | null
}

export type UserActionId =
  | "view"
  | "rewind"
  | "regenerate"
  | "role"
  | "grant"
  | "exempt"
  | "cancel"
  | "stripe"
  | "disable"
  | "removeAccess"

export interface UserActionContext {
  now: number
  stripeEnabled: boolean
  hasStripeDashboard: boolean
  /**
   * The list adds View details and View Rewind; the detail page is already
   * the first and has its own View Rewind button.
   */
  inList: boolean
}

/** The actions available on `user`, in menu order. */
export function userActionIds(user: UserActionTarget, ctx: UserActionContext): UserActionId[] {
  const regenerable = canRegenerate(
    { status: user.wrappedRunStartedAt ? "generating" : user.wrappedStatus, runStartedAt: user.wrappedRunStartedAt },
    ctx.now
  )
  const billing = ctx.stripeEnabled
  const rules: [UserActionId, boolean][] = [
    ["view", ctx.inList],
    ["rewind", ctx.inList],
    ["regenerate", regenerable],
    ["role", !user.isOwner],
    ["grant", billing && !user.isAdmin && !user.isExempt],
    ["exempt", billing && !user.isAdmin],
    ["cancel", billing && (user.subscriptionStatus === "ACTIVE" || user.subscriptionStatus === "PAST_DUE")],
    ["stripe", billing && ctx.hasStripeDashboard && user.stripeCustomerId !== null],
    ["disable", !user.isOwner],
    ["removeAccess", !user.isAdmin && user.plexUserId !== null && user.plexAccess !== "notShared"],
  ]
  return rules.filter(([, shown]) => shown).map(([id]) => id)
}

/** A users-list row as an action target; a member without a name goes by their email. */
export function listUserTarget(user: AdminUserWithWrappedStats): UserActionTarget {
  return {
    id: user.id,
    name: user.name || user.email || "Unknown member",
    plexUserId: user.plexUserId,
    services: user.services,
    isAdmin: user.isAdmin,
    isOwner: user.isOwner,
    disabled: user.disabledAt !== null,
    plexAccess: plexAccessOf(user),
    wrappedStatus: user.wrappedStatus,
    wrappedRunStartedAt: user.wrappedRunStartedAt,
    subscriptionStatus: user.subscriptionStatus,
    isExempt: user.isExempt,
    stripeCustomerId: user.stripeCustomerId,
  }
}
