import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"

import { ConditionEditor, type ConditionEditorProps } from "@/components/admin/cleanup/editor/condition-editor/condition-editor"
import type { ConditionEditorFocus } from "@/components/admin/cleanup/editor/condition-editor/editor-parts"
import { Button } from "@/components/ui/button"
import { Token } from "@/components/ui/token"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"

/** The `md` query of `TokenPicker`: true opens the Popover, false the phone Sheet. */
export const viewport = { wide: true }

/** Installs a `matchMedia` that answers the `md` query from `viewport.wide`, and restores the real one. */
export function useViewport() {
  const original = window.matchMedia
  beforeEach(() => {
    viewport.wide = true
    window.matchMedia = ((query: string) => ({
      get matches() {
        return viewport.wide
      },
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })
}

export const LAST_PLAYED: DraftCondition = {
  id: "c2",
  field: "watch.lastPlayed",
  op: "moreThan",
  value: { duration: { amount: 365, unit: "days" }, orNever: true },
}

export const FOCUS: ConditionEditorFocus = {
  matches: 197,
  historyStart: "2022-06-14",
  zone: "UTC",
  data: {
    presets: [
      { value: { amount: 90, unit: "days" }, label: "90 days", matches: 268 },
      { value: { amount: 180, unit: "days" }, label: "180 days", matches: 231 },
      { value: { amount: 365, unit: "days" }, label: "365 days", matches: 197 },
      { value: { amount: 2, unit: "years" }, label: "2 years", matches: 158 },
    ],
    buckets: [
      { label: "Last 30 days", count: 54, passes: false },
      { label: "1 to 3 months", count: 61, passes: false },
      { label: "3 to 6 months", count: 72, passes: false },
      { label: "6 to 12 months", count: 112, passes: false },
      { label: "1 to 2 years", count: 166, passes: true },
      { label: "2 years or more", count: 162, passes: true },
      { label: "Never", count: 150, passes: true },
    ],
    summary: "478 of 777 movies pass this condition.",
    computedDate: "Played before Nov 8, 2025, server time (UTC).",
  },
}

export const calls = {
  onDraftChange: jest.fn(),
  onDone: jest.fn(),
  onCancel: jest.fn(),
  onRemove: jest.fn(),
}

export type HarnessProps = Partial<Omit<ConditionEditorProps, "open" | "anchor">>

/** A token that opens the editor, a stop after it, and an editor that keeps what Done gives it. */
export function Harness({ condition: start = LAST_PLAYED, ...props }: HarnessProps) {
  const [open, setOpen] = useState(false)
  const [condition, setCondition] = useState(start)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <main>
      <Token ref={anchor} part="value" state={open ? "open" : "default"} onClick={() => setOpen(true)} data-testid="admin-cleanup-condition-c2-value">
        365 days
      </Token>
      <Button>Add condition</Button>
      <ConditionEditor
        condition={condition}
        conditionRole="condition"
        index={2}
        total={3}
        level="movie"
        focusPart="value"
        focus={FOCUS}
        requesterOptions={[]}
        sources={[]}
        onDraftChange={calls.onDraftChange}
        onDone={(next) => {
          calls.onDone(next)
          setCondition(next)
          setOpen(false)
        }}
        onCancel={() => {
          calls.onCancel()
          setOpen(false)
        }}
        onRemove={() => {
          calls.onRemove()
          setOpen(false)
        }}
        {...props}
        open={open}
        anchor={anchor}
      />
    </main>
  )
}

/** A condition editor test id. */
export const id = (part: string) => `admin-cleanup-condition-editor-${part}`
export const token = () => screen.getByTestId("admin-cleanup-condition-c2-value")
export const number = () => screen.getByTestId(id("number"))

/** Renders the harness and opens the editor from the token. */
export async function openEditor(props: HarnessProps = {}) {
  const user = userEvent.setup()
  const view = render(<Harness {...props} />)
  await user.click(token())
  const editor = await screen.findByTestId("admin-cleanup-condition-editor")
  return { user, editor, view }
}
