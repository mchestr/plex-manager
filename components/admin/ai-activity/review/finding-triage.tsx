"use client"

import { useState, useTransition } from "react"

import { setFindingStatus } from "@/actions/admin/conversation-review"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { FindingStatus } from "@/lib/generated/prisma/client"
import { FINDING_STATUS_LABEL, labelOptions } from "@/lib/ui/finding-labels"

const STATUS_ITEMS = labelOptions(FINDING_STATUS_LABEL)

interface FindingTriageProps {
  findingId: string
  status: FindingStatus
  note: string | null
  /** The id of the card's title, so each control says which finding it triages. */
  describedBy: string
}

/**
 * A finding's status and note. Choosing a status saves it at once; the note
 * saves through its own button and sends no status, so it never re-triages
 * the finding. `setFindingStatus` refreshes the page, so nothing here
 * invalidates a query. A stored status the refresh brings replaces the shown
 * one, and a stored note replaces the draft only while it has no unsaved
 * edits, so a refresh never wipes a note being typed. A failed save shows
 * the action's error in a toast and puts the status back. The Select stays
 * enabled while it saves, so keyboard focus stays on it.
 */
export function FindingTriage({ findingId, status, note, describedBy }: FindingTriageProps) {
  const { showError } = useToast()
  const [value, setValue] = useState(status)
  const [draft, setDraft] = useState(note ?? "")
  // The note as stored: from the page, or as this card just saved it. A draft that differs has unsaved edits
  const [savedNote, setSavedNote] = useState(note ?? "")
  const [stored, setStored] = useState({ status, note })
  const [, startSaving] = useTransition()
  const [isSavingNote, startSavingNote] = useTransition()

  // A refresh brought a different stored status or note: show what changed, and keep a draft with unsaved edits
  if (stored.status !== status || stored.note !== note) {
    setStored({ status, note })
    if (stored.status !== status) setValue(status)
    if (stored.note !== note) {
      setSavedNote(note ?? "")
      if (draft === savedNote) setDraft(note ?? "")
    }
  }

  const changeStatus = (next: FindingStatus | null) => {
    if (!next || next === value) return
    const previous = value
    setValue(next)
    startSaving(async () => {
      const result = await setFindingStatus({ findingId, status: next })
      if (!result.success) {
        setValue(previous)
        showError(result.error)
      }
    })
  }

  const saveNote = () => {
    const sent = draft
    const saved = draft.trim()
    startSavingNote(async () => {
      const result = await setFindingStatus({ findingId, note: saved })
      if (!result.success) {
        showError(result.error)
        return
      }
      setSavedNote(saved)
      // Show the note as saved (trimmed), unless more was typed while it saved
      setDraft((current) => (current === sent ? saved : current))
    })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="sm:w-44">
        <Select items={STATUS_ITEMS} value={value} onValueChange={changeStatus}>
          <SelectTrigger aria-label="Status" aria-describedby={describedBy} data-testid={`finding-status-select-${findingId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`finding-status-option-${item.value}`}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Textarea
          aria-label="Note"
          aria-describedby={describedBy}
          placeholder="Add a note (optional)"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          className="min-h-16"
          data-testid={`finding-note-${findingId}`}
        />
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={saveNote}
          loading={isSavingNote}
          loadingLabel="Saving"
          aria-describedby={describedBy}
          data-testid={`finding-note-save-${findingId}`}
        >
          Save note
        </Button>
      </div>
    </div>
  )
}
