"use client"

import type { Route } from "next"
import Link from "next/link"

import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

import { RollbackDialog } from "./rollback-dialog"

interface RewindPreviewActionsProps {
  userId: string
  year: number
  name: string
  /** What Roll back would restore, or null when there is nothing to restore. */
  rollback: { from: string | null } | null
  /** "Read as an article" (or "Play the story" while reading), when the year has a v3 issue. */
  toggle: { href: Route; label: string } | null
}

/** The preview page's actions (P7.9): Regenerate, Roll back and "Read as an article". */
export function RewindPreviewActions({ userId, year, name, rollback, toggle }: RewindPreviewActionsProps) {
  const toast = useToast()

  return (
    <>
      {toggle && (
        <Button variant="outline" nativeButton={false} render={<Link href={toggle.href} />} data-testid="admin-rewind-preview-toggle">
          {toggle.label}
        </Button>
      )}
      {rollback ? (
        <RollbackDialog
          userId={userId}
          year={year}
          name={name}
          from={rollback.from}
          trigger={
            <Button variant="outline" data-testid="admin-rewind-preview-rollback">
              Roll back...
            </Button>
          }
        />
      ) : (
        <Button variant="outline" disabled data-testid="admin-rewind-preview-rollback">
          Roll back...
        </Button>
      )}
      <ConfirmDialog
        trigger={<Button data-testid="admin-rewind-preview-regenerate">Regenerate...</Button>}
        title={`Regenerate ${name}'s Rewind ${year}?`}
        description="A new run replaces the current version when it finishes. Roll back restores this one."
        confirmLabel="Regenerate"
        pendingLabel="Starting"
        action={async () => {
          const result = await adminRegenerateRewind({ userId, year })
          if (!result.success) return { error: result.error }
          toast.showSuccess(result.data.alreadyQueued ? `${name}'s Rewind is already generating` : `Regenerating ${name}'s Rewind`)
          return {}
        }}
        data-testid="admin-rewind-preview-regenerate-dialog"
      />
    </>
  )
}
