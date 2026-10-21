"use client"

import { useState } from "react"

import { deleteAnnouncement } from "@/actions/announcements"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/ui/page-header"
import { useToast } from "@/components/ui/toast"
import { useOpenFromParam } from "@/hooks/use-open-from-param"
import type { AdminAnnouncementRow } from "@/lib/admin/announcements"

import { AnnouncementDialog } from "./announcement-dialog"
import { AnnouncementsTable } from "./announcements-table"

type Editing = { row: AdminAnnouncementRow | null } | null

interface AnnouncementsManagerProps {
  rows: AdminAnnouncementRow[]
  /** The server zone expiry is typed in (`serverZone()`). */
  zone: string
}

/** `/admin/announcements` (P10.5): the header, the table, the form dialog and the delete confirm. */
export function AnnouncementsManager({ rows, zone }: AnnouncementsManagerProps) {
  const { showSuccess } = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<AdminAnnouncementRow | null>(null)
  const openNew = () => setEditing({ row: null })

  // The command menu's New announcement quick action (P10.16)
  useOpenFromParam("new", openNew)

  const remove = async () => {
    if (!deleting) return {}
    const result = await deleteAnnouncement({ id: deleting.id })
    if (!result.success) return { error: result.error }
    showSuccess("Announcement deleted")
    return {}
  }

  const newButton = (testId: string) => (
    <Button onClick={openNew} data-testid={testId}>
      New announcement
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Announcements"
        description="News on every member's home page and the announcements page."
        actions={newButton("create-announcement-button")}
        data-testid="admin-announcements-header"
      />
      <AnnouncementsTable
        rows={rows}
        onEdit={(row) => setEditing({ row })}
        onDelete={setDeleting}
        createAction={newButton("announcements-empty-create")}
      />
      <AnnouncementDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        announcement={editing?.row ?? null}
        zone={zone}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete the announcement '${deleting.title}'?` : "Delete the announcement?"}
        description="It leaves home and the announcements page. This can't be undone."
        confirmLabel="Delete announcement"
        pendingLabel="Deleting"
        tone="destructive"
        action={remove}
        data-testid="announcement-delete-dialog"
        confirmTestId="announcement-delete-confirm"
      />
    </>
  )
}
