"use client"

import { useActionState, useState } from "react"

import { createAnnouncement, updateAnnouncement } from "@/actions/announcements"
import { AnnouncementItem } from "@/components/announcements/announcement-item"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/ui/submit-button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { AdminAnnouncementRow } from "@/lib/admin/announcements"
import { instantToWallTime } from "@/lib/utils/zoned-time"

interface FormState {
  error: string | null
  fieldErrors: Record<string, string[] | undefined>
  /** The uncontrolled fields as submitted, re-seeded after an error (React resets the form). */
  values: { priority: string; expiresAt: string } | null
}

const NO_ERRORS: FormState = { error: null, fieldErrors: {}, values: null }

interface AnnouncementFormProps {
  /** The row being edited, or null for a new announcement. */
  announcement: AdminAnnouncementRow | null
  zone: string
  onSaved: () => void
}

function AnnouncementForm({ announcement, zone, onSaved }: AnnouncementFormProps) {
  const { showSuccess } = useToast()
  const [title, setTitle] = useState(announcement?.title ?? "")
  const [content, setContent] = useState(announcement?.content ?? "")
  const [isActive, setIsActive] = useState(announcement?.isActive ?? true)
  // A new announcement previews as posted now.
  const [createdAt] = useState(() => announcement?.createdAt ?? new Date().toISOString())

  const [state, formAction, pending] = useActionState(async (_previous: FormState, form: FormData): Promise<FormState> => {
    const values = { priority: String(form.get("priority") ?? ""), expiresAt: String(form.get("expiresAt") ?? "") }
    const input = {
      title: String(form.get("title") ?? ""),
      content: String(form.get("content") ?? ""),
      priority: Number(values.priority || 0),
      isActive,
      expiresAt: values.expiresAt,
    }
    const result = announcement ? await updateAnnouncement({ id: announcement.id, ...input }) : await createAnnouncement(input)
    if (!result.success) return { error: result.error, fieldErrors: result.fieldErrors ?? {}, values }
    showSuccess(announcement ? "Announcement saved" : "Announcement created")
    onSaved()
    return NO_ERRORS
  }, NO_ERRORS)

  const fieldError = (name: string) => state.fieldErrors[name]?.[0]
  const hasFieldErrors = Object.values(state.fieldErrors).some((messages) => messages?.length)

  return (
    <form action={formAction} className="flex flex-col gap-6" data-testid="announcement-form">
      {state.error && !hasFieldErrors && (
        <Alert tone="destructive" data-testid="announcement-form-error">
          {state.error}
        </Alert>
      )}
      <FormField name="title" label="Title" error={fieldError("title")}>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
          required
          data-testid="announcement-title-input"
        />
      </FormField>
      <FormField name="content" label="Content" description="Markdown: lists, links and bold" error={fieldError("content")}>
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={6}
          required
          data-testid="announcement-content-input"
        />
      </FormField>
      <section aria-label="Preview" className="flex flex-col gap-2" data-testid="announcement-preview">
        <p className="text-label text-muted-foreground">Preview, as members see it on the home page</p>
        <div className="rounded-lg border bg-card p-4">
          <AnnouncementItem
            announcement={{ id: "preview", title: title || "Untitled", content, createdAt }}
            isNew
            as="h3"
            data-testid="announcement-preview-item"
          />
        </div>
      </section>
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField name="priority" label="Priority" description="Higher shows first" error={fieldError("priority")}>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={state.values?.priority ?? announcement?.priority ?? 0}
            data-testid="announcement-priority-input"
          />
        </FormField>
        <FormField
          name="expiresAt"
          label="Expires"
          optional
          description={<span data-testid="announcement-expires-zone">Times are in {zone}.</span>}
          error={fieldError("expiresAt")}
        >
          <Input
            type="datetime-local"
            defaultValue={state.values?.expiresAt ?? (announcement?.expiresAt ? instantToWallTime(new Date(announcement.expiresAt), zone) : "")}
            data-testid="announcement-expires-input"
          />
        </FormField>
      </div>
      <Field className="flex-row items-start justify-between gap-4">
        <FieldLabel>Visible to members</FieldLabel>
        <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="announcement-active-checkbox" />
      </Field>
      <DialogFooter>
        <DialogClose render={<Button data-testid="announcement-cancel-button" type="button" variant="ghost" disabled={pending} />}>Cancel</DialogClose>
        <SubmitButton loadingLabel={announcement ? "Saving" : "Creating"} data-testid="announcement-submit-button">
          {announcement ? "Save announcement" : "Create announcement"}
        </SubmitButton>
      </DialogFooter>
    </form>
  )
}

interface AnnouncementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement: AdminAnnouncementRow | null
  /** The server zone the expiry is typed in. */
  zone: string
}

/**
 * The 640px announcement form (P10.5): a `<form action>` with `useActionState`,
 * errors inside the dialog (UI-42), and a live preview that renders the
 * member's `AnnouncementItem` with the "New" pip, as a member who hasn't
 * looked since it was posted sees it. Success closes it with a toast.
 */
export function AnnouncementDialog({ open, onOpenChange, announcement, zone }: AnnouncementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="form" align="top" data-testid="announcement-dialog">
        <DialogHeader>
          <DialogTitle>{announcement ? "Edit announcement" : "New announcement"}</DialogTitle>
        </DialogHeader>
        <AnnouncementForm
          key={announcement?.id ?? "new"}
          announcement={announcement}
          zone={zone}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
