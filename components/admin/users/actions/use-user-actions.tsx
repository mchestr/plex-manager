"use client"

import {
  Ban,
  BadgeCheck,
  CircleSlash,
  ExternalLink,
  Gift,
  Play,
  RefreshCw,
  ShieldOff,
  ShieldPlus,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import type { RowAction } from "@/components/ui/data-table/row-actions"
import { userDetail, userRewind } from "@/lib/admin/routes"
import { type UserActionId, type UserActionTarget, userActionIds } from "@/lib/admin/user-actions"

import { ChangeRoleDialog, DisableDialog, RegenerateDialog, RemoveAccessDialog } from "./access-dialogs"
import { CancelSubscriptionDialog, GrantAccessDialog, ToggleExemptDialog } from "./billing-dialogs"

type DialogId = Extract<UserActionId, "regenerate" | "role" | "grant" | "exempt" | "cancel" | "disable" | "removeAccess">

interface UseUserActionsOptions {
  /** The season year that View Rewind and Regenerate act on. */
  year: number
  stripeEnabled: boolean
  stripeDashboardBaseUrl: string | null
  /** The Regenerate confirm's cost line, from `regenerateEstimateCopy`. */
  estimateCopy: string
  /** The list offers View details and View Rewind; the detail page has neither in its menu. */
  inList: boolean
}

/**
 * One member action menu for the users list and the user detail header
 * (P10.18): `actionsFor(user)` builds the `RowAction`s from
 * `userActionIds`, and `dialogs` renders the one ConfirmDialog a menu item
 * opened. Render `dialogs` once, beside the table or the menu; pass
 * `actionsFor` (through a row-to-target mapping) as the DataTable's
 * `rowActions`, or straight to `RowActions`.
 */
export function useUserActions({ year, stripeEnabled, stripeDashboardBaseUrl, estimateCopy, inList }: UseUserActionsOptions) {
  // Read once per mount, so the render stays pure.
  const [now] = useState(() => Date.now())
  const [opened, setOpened] = useState<{ id: DialogId; user: UserActionTarget } | null>(null)

  const actionsFor = (user: UserActionTarget): RowAction[] => {
    const open = (id: DialogId) => () => setOpened({ id, user })
    const items: Record<UserActionId, RowAction> = {
      view: { id: "view", label: "View details", icon: UserRound, href: userDetail(user.id) },
      rewind: { id: "rewind", label: `View Rewind ${year}`, icon: Play, href: userRewind(user.id, year) },
      regenerate: { id: "regenerate", label: "Regenerate Rewind...", icon: RefreshCw, onSelect: open("regenerate") },
      role: user.isAdmin
        ? { id: "role", label: "Remove admin role...", icon: ShieldOff, onSelect: open("role") }
        : { id: "role", label: "Make admin...", icon: ShieldPlus, onSelect: open("role") },
      grant: { id: "grant", label: "Grant comp access...", icon: Gift, onSelect: open("grant") },
      exempt: user.isExempt
        ? { id: "exempt", label: "Remove exemption...", icon: CircleSlash, onSelect: open("exempt") }
        : { id: "exempt", label: "Mark exempt...", icon: BadgeCheck, onSelect: open("exempt") },
      cancel: { id: "cancel", label: "Cancel subscription...", icon: Ban, onSelect: open("cancel") },
      stripe: {
        id: "stripe",
        label: "View in Stripe",
        icon: ExternalLink,
        onSelect: () => window.open(`${stripeDashboardBaseUrl}/customers/${user.stripeCustomerId}`, "_blank", "noopener,noreferrer"),
        testId: "view-in-stripe-link",
      },
      disable: user.disabled
        ? { id: "disable", label: "Enable account...", icon: UserCheck, onSelect: open("disable"), testId: "admin-user-disable-button" }
        : {
            id: "disable",
            label: "Disable account...",
            icon: UserX,
            variant: "destructive",
            onSelect: open("disable"),
            testId: "admin-user-disable-button",
          },
      removeAccess: {
        id: "removeAccess",
        label: "Remove Plex access...",
        icon: Ban,
        variant: "destructive",
        onSelect: open("removeAccess"),
      },
    }
    const ctx = { now, stripeEnabled, hasStripeDashboard: Boolean(stripeDashboardBaseUrl), inList }
    return userActionIds(user, ctx).map((id) => items[id])
  }

  let dialogs: ReactNode = null
  if (opened) {
    const props = { user: opened.user, open: true, onOpenChange: (open: boolean) => !open && setOpened(null) }
    const byId: Record<DialogId, ReactNode> = {
      regenerate: <RegenerateDialog {...props} year={year} estimateCopy={estimateCopy} />,
      role: <ChangeRoleDialog {...props} />,
      grant: <GrantAccessDialog {...props} />,
      exempt: <ToggleExemptDialog {...props} />,
      cancel: <CancelSubscriptionDialog {...props} />,
      disable: <DisableDialog {...props} />,
      removeAccess: <RemoveAccessDialog {...props} />,
    }
    dialogs = byId[opened.id]
  }

  return { actionsFor, dialogs }
}
