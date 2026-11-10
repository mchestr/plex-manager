import Link from "next/link"

import { checkTextId } from "@/components/admin/cleanup/turn-on/ready-checks"
import { ModeChoice } from "@/components/admin/cleanup/turn-on/mode-choice"
import {
  blockReason,
  buttonLabel,
  isChangeMode,
  noteText,
  typedCount,
  typedLabel,
} from "@/components/admin/cleanup/turn-on/turn-on-words"
import type { TurnOnState } from "@/components/admin/cleanup/turn-on/use-turn-on"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { cleanupRule } from "@/lib/admin/routes"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"

/** UX 8.6 "Turn-on numbers changed". @internal Exported for tests. */
export const CHANGED_WORDS = {
  title: "The numbers changed. Check them again.",
  body: "This page is older than 15 minutes, or the matches changed. Nothing was added.",
} as const

interface TurnOnPanelProps {
  data: CleanupTurnOnData
  state: TurnOnState
  /** The job queue is set up (TS 9.5 item 4). */
  redis: boolean
  /** The `useId()` of the view. */
  idBase: string
  /** The leave date as the mode cards say it: "Dec 8". */
  day: string
}

/**
 * "At the leave date" (UX 4.6 right column items 2 to 6): the mode choice,
 * the typed approval for Automatic above 50 items, the changed alert, the
 * button that names the result with the note of the chosen mode under it,
 * Cancel and the note on starting smaller.
 *
 * While a check fails, the typed count does not match, or the job queue is
 * not set up, the button is disabled but stays focusable, and its
 * description names the reason (UX 11.3 item 9.5): the failed check text,
 * or a line under the button.
 */
export function TurnOnPanel({ data, state, redis, idBase, day }: TurnOnPanelProps) {
  const { mode, typed, notice, pending } = state
  const labelId = `${idBase}-mode-label`
  const noteId = `${idBase}-note`
  const reasonId = `${idBase}-reason`
  const count = typedCount(data, mode)
  const reason = blockReason({ data, mode, redis, typed })
  const reasonRef = reason === null ? null : reason.kind === "check" ? checkTextId(idBase, reason.check) : reasonId
  const items = NOUNS[data.rule.level][1]

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" id={labelId}>
          At the leave date
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-3">
        <ModeChoice data={data} mode={mode} onModeChange={state.setMode} labelId={labelId} day={day} />
        {count !== null && (
          <FormField name="admin-cleanup-turn-on-typed" label={typedLabel(count)}>
            <Input
              value={typed}
              onValueChange={state.setTyped}
              inputMode="numeric"
              autoComplete="off"
              className="w-32"
              data-testid="admin-cleanup-turn-on-typed"
            />
          </FormField>
        )}
        {notice?.kind === "changed" && (
          <Alert tone="warning" title={CHANGED_WORDS.title} data-testid="admin-cleanup-turn-on-changed">
            {CHANGED_WORDS.body}
          </Alert>
        )}
        {notice?.kind === "error" && (
          <Alert tone="destructive" data-testid="admin-cleanup-turn-on-error">
            {notice.text}
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => void state.press()}
            disabled={reason !== null}
            focusableWhenDisabled
            loading={pending}
            loadingLabel={isChangeMode(data) ? "Changing the mode" : "Turning on"}
            aria-describedby={[reasonRef, noteId].filter(Boolean).join(" ")}
            data-testid="admin-cleanup-turn-on-confirm"
          >
            {buttonLabel(data, mode)}
          </Button>
          {reason !== null && reason.kind !== "check" && (
            <p id={reasonId} className="text-label text-foreground" data-testid="admin-cleanup-turn-on-reason">
              {reason.text}
            </p>
          )}
          <p id={noteId} className="text-label text-muted-foreground" data-testid="admin-cleanup-turn-on-confirm-note">
            {noteText(data, mode)}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full"
          nativeButton={false}
          render={<Link href={cleanupRule(data.rule.id)} />}
          data-testid="admin-cleanup-turn-on-cancel"
        >
          Cancel
        </Button>
        <p className="text-label text-muted-foreground">
          To start smaller, add a condition first. Pause all cleanup, or move this rule back to Dry run, at any time: its {items} then leave Leaving
          soon and nothing is deleted.
        </p>
      </CardContent>
    </Card>
  )
}
