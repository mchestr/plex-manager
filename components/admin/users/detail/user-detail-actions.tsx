"use client"

import { useUserActions } from "@/components/admin/users/actions/use-user-actions"
import { RowActions } from "@/components/ui/data-table/row-actions"
import type { UserActionTarget } from "@/lib/admin/user-actions"

interface UserDetailActionsProps {
  user: UserActionTarget
  year: number
  stripeEnabled: boolean
  stripeDashboardBaseUrl: string | null
  estimateCopy: string
}

/** The detail header's action menu: the users list's row menu, without View details and View Rewind (P10.18). */
export function UserDetailActions({ user, ...options }: UserDetailActionsProps) {
  const { actionsFor, dialogs } = useUserActions({ ...options, inList: false })
  const actions = actionsFor(user)
  // The owner, mid-run, has nothing left to offer
  if (actions.length === 0) return null
  return (
    <>
      <RowActions name={user.name} actions={actions} data-testid="admin-user-actions" />
      {dialogs}
    </>
  )
}
