"use client"

import { type ReactNode, useEffect, useState } from "react"

import type { SheetFormControls } from "@/components/admin/settings/sheet-form"
import { Button } from "@/components/ui/button"
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog"
import { useReportDirty } from "@/components/ui/settings-edit-context"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

interface SettingsSheetProps {
  /** The list section it belongs to, whose nav item shows the "Unsaved changes" pip while the form is dirty. */
  section: string
  /** The form's footer id ("mcp", "sonarr"): the guard is `settings-<id>-discard-dialog`. */
  id: string
  /** What the guard names: "Discard changes to Sonarr?" */
  name: string
  title: string
  description?: string
  /** "Edit", "Set up" or "Add". */
  trigger: string
  /** Ends the trigger's accessible name for screen readers: "Edit Memini". */
  triggerLabel: string
  triggerTestId: string
  sheetTestId: string
  children: (controls: Required<SheetFormControls>) => ReactNode
}

/**
 * One row's edit mode in a list section (Assistant sources; Sonarr, Radarr,
 * Jellyfin): the row is the view, and its Edit, Set up or Add opens the
 * row's `SheetForm` in this Sheet (list-detail, NN/g "Progressive
 * disclosure"). A save closes it and focus returns to the trigger. Escape,
 * the backdrop, Close and Cancel close it too, but with unsaved changes they
 * ask first (Cloudscape, "Unsaved changes"): Keep editing stays, Discard
 * closes. While a save is in flight they do nothing, as in a section: the
 * save's outcome closes the Sheet or keeps it open. Its unsaved changes
 * count as its section's, for the nav pip and the browser's leave prompt.
 */
export function SettingsSheet({ section, id, name, title, description, trigger, triggerLabel, triggerTestId, sheetTestId, children }: SettingsSheetProps) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Sheets are modal, so one open Sheet speaks for its section at a time
  const reportDirty = useReportDirty()
  const unsaved = open && dirty
  useEffect(() => {
    if (unsaved) reportDirty?.(section, true)
    return () => {
      if (unsaved) reportDirty?.(section, false)
    }
  }, [reportDirty, section, unsaved])

  const close = () => {
    setOpen(false)
    setDirty(false)
    setPending(false)
    setConfirming(false)
  }
  const cancel = () => (dirty ? setConfirming(true) : close())

  return (
    <Sheet
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          setOpen(true)
          return
        }
        // Discard can't take back a write already on its way
        if (pending) {
          details.cancel()
          return
        }
        // A dirty Sheet stays open, with no closing side effects, while it asks
        if (dirty) details.cancel()
        cancel()
      }}
    >
      <SheetTrigger render={<Button variant="secondary" size="sm" data-testid={triggerTestId} />}>
        {trigger}
        <span className="sr-only"> {triggerLabel}</span>
      </SheetTrigger>
      <SheetContent side="right" className="max-w-[480px]" data-testid={sheetTestId}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {children({ onDone: close, onCancel: cancel, onDirtyChange: setDirty, onPendingChange: setPending })}
        {/* Inside the Sheet, so it stacks above it and Escape closes only the question */}
        <DiscardChangesDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={name}
          onDiscard={close}
          data-testid={`settings-${id}-discard-dialog`}
        />
      </SheetContent>
    </Sheet>
  )
}
