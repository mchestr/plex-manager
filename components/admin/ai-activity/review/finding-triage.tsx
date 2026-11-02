"use client"

import { useState, useTransition } from "react"

import { setFindingStatus } from "@/actions/admin/conversation-review"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { FindingStatus } from "@/lib/generated/prisma/client"

const STATUS_ITEMS: Array<{ value: FindingStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "fixed", label: "Fixed" },
  { value: "wont_fix", label: "Won't fix" },
  { value: "false_alarm", label: "False alarm" },
]

interface FindingTriageProps {
  findingId: string
  status: FindingStatus
  note: string | null
}

/**
 * A finding's status and note. Choosing a status saves it at once; the note
 * saves through its own button. `setFindingStatus` refreshes the page, so
 * nothing here invalidates a query. A failed save shows the action's error
 * in a toast and puts the status back.
 */
export function FindingTriage({ findingId, status, note }: FindingTriageProps) {
  const { showError } = useToast()
  const [value, setValue] = useState(status)
  const [draft, setDraft] = useState(note ?? "")
  const [isSaving, startSaving] = useTransition()
  const [isSavingNote, startSavingNote] = useTransition()

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
    startSavingNote(async () => {
      const result = await setFindingStatus({ findingId, status: value, note: draft.trim() })
      if (!result.success) showError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="sm:w-44">
        <Select items={STATUS_ITEMS} value={value} onValueChange={changeStatus} disabled={isSaving}>
          <SelectTrigger aria-label="Status" data-testid={`finding-status-select-${findingId}`}>
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
          data-testid={`finding-note-save-${findingId}`}
        >
          Save note
        </Button>
      </div>
    </div>
  )
}
