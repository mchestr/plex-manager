"use client"

import { type FormEvent, type KeyboardEvent, type ReactNode, startTransition, useEffect, useLayoutEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog"
import { useSectionEditing } from "@/components/ui/settings-edit-context"
import { SettingsFormFooter, type TestResult } from "@/components/ui/settings-form-footer"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import type { SettingsFormState } from "@/hooks/admin/use-settings-form"
import { resolveStatus, type ConnectionStatus } from "@/lib/ui/status"
import { cn } from "@/lib/utils"

export type { TestResult }

function SectionStatus({ id, status, checkedAt }: { id: string; status: ConnectionStatus; checkedAt?: string | Date | null }) {
  const sub = resolveStatus("connection", status).sub
  const showChecked = checkedAt && status !== "notConfigured" && status !== "disabled"
  return (
    <span className="flex flex-col items-start gap-0.5 sm:items-end" data-testid={`settings-${id}-status`}>
      <StatusBadge domain="connection" value={status} />
      {showChecked ? (
        <span className="text-caption text-muted-foreground">
          Checked <Time value={checkedAt} nowLabel="just now" />
        </span>
      ) : (
        sub && <span className="text-caption text-muted-foreground">{sub}</span>
      )}
    </span>
  )
}

/** The first control to focus on Edit: a marked one, else the first enabled field shown (tabs and plain buttons skipped). */
function firstField(form: HTMLFormElement): HTMLElement | null {
  const marked = form.querySelector<HTMLElement>("[data-settings-autofocus]")
  if (marked) return marked
  const fields = form.querySelectorAll<HTMLElement>(
    "input:not([type=hidden]), textarea, [role=combobox], [role=checkbox], [role=switch], [role=radio], [role=slider]"
  )
  return Array.from(fields).find((field) => !field.closest("[hidden]") && !field.matches(":disabled, [aria-disabled=true], [data-disabled]")) ?? null
}

interface SettingsSectionProps {
  /** The anchor for the section nav, with `scroll-margin-top`; the root is `settings-<id>-section`. */
  id: string
  title: string
  description: ReactNode
  /** The section's health from `lib/ui/status.ts`. Left out for a section with nothing to check. */
  status?: ConnectionStatus
  /** When `status` was checked: "Checked 4 minutes ago". */
  checkedAt?: string | Date | null
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
  /** Tests the saved values in view mode and the typed ones while editing. */
  onTest?: () => Promise<TestResult>
  /**
   * The section's form. With it the section opens read-only: `view` shows
   * the saved values and Edit swaps in `children`. Leave it out for a section
   * with nothing to edit (Privacy, Security), whose `children` always show.
   */
  form?: SettingsFormState
  /**
   * View mode: the saved values, as a `SettingsSummary`. A function gets
   * `edit`, which opens the form and focuses the control a selector names
   * ("Enter it again" on an unreadable secret).
   */
  view?: ReactNode | ((edit: (options?: { focus?: string }) => void) => ReactNode)
  /** Nothing is stored yet: view mode says "Not set up." and Edit reads "Set up". */
  notSetUp?: boolean
  /** Both modes, above the summary or fields and outside the form: switches that save at once, status rows. */
  live?: ReactNode
  /** Both modes, after the summary or fields: last runs, notes, actions on the saved values. */
  after?: ReactNode
  /** The fields while editing; without `form`, the section's content. */
  children?: ReactNode
  className?: string
}

/**
 * One settings section (ui-design-system 5.5 and 6.4): a card with the
 * title, the connection badge and "Checked ..." in the header, and the
 * {@link SettingsFormFooter}.
 *
 * A section with a `form` opens read-only (GOV.UK summary card): its saved
 * values, Test connection and "Last saved". Edit, named for the section
 * ("Edit Plex server"), swaps the summary for the fields in place and moves
 * focus to the first field; the card's border, an "Editing" badge and Save
 * and Cancel mark the mode (NN/g, "Modes"). Save with nothing changed just
 * closes; a successful save closes and returns focus to Edit; a failed one
 * stays open on the first invalid field. Cancel and Escape close, asking
 * first when there are unsaved changes. The page opens one section at a
 * time, and a dirty one stays open, reporting itself to the section nav.
 *
 * `form.blockedReason` disables Test and Save and says why; a submit that
 * gets past it still reaches the server, which refuses on the same rule
 * (SEC-31).
 */
export function SettingsSection({
  id,
  title,
  description,
  status,
  checkedAt,
  footerMeta,
  onTest,
  form,
  view,
  notSetUp = false,
  live,
  after,
  children,
  className,
}: SettingsSectionProps) {
  const mode = useSectionEditing(id)
  const dirty = Boolean(form?.isDirty)
  const editing = Boolean(form) && (mode.editing || dirty)
  const formId = `settings-${id}-form`
  const [confirming, setConfirming] = useState(false)
  const [exits, setExits] = useState(0)
  const [failures, setFailures] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  // The newest form, for leaving edit mode after an await
  const latest = useRef(form)
  useLayoutEffect(() => {
    latest.current = form
  })

  const { reportDirty } = mode
  useEffect(() => {
    reportDirty?.(id, dirty)
  }, [reportDirty, id, dirty])
  useEffect(() => () => reportDirty?.(id, false), [reportDirty, id])

  // Edit, Set up or a link from elsewhere: focus the requested control or the first field
  const requestN = mode.request?.n
  const requestFocus = mode.request?.focus
  useEffect(() => {
    const element = formRef.current
    if (requestN === undefined || !element) return
    const target = (requestFocus ? element.querySelector<HTMLElement>(requestFocus) : null) ?? firstField(element)
    target?.focus()
  }, [requestN, requestFocus])

  // Back in view mode: focus returns to Edit, which stands where the form's trigger was
  useEffect(() => {
    if (exits > 0) editRef.current?.focus()
  }, [exits])

  // A failed save: the first field that says what is wrong
  useEffect(() => {
    if (failures > 0) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
  }, [failures])

  const exit = () => {
    latest.current?.onDiscard()
    mode.endEdit()
    setConfirming(false)
    setExits((n) => n + 1)
  }

  const cancel = () => {
    if (form?.isPending) return
    if (form?.isDirty) setConfirming(true)
    else exit()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!form || form.isPending) return
    if (!form.isDirty) {
      exit()
      return
    }
    void form.onSave().then((ok) => {
      // In a transition, so the summary shows with the refreshed saved values
      if (ok) startTransition(exit)
      else setFailures((n) => n + 1)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return
    // Portalled popups (Select, Popover) bubble through React but are not inside the form
    const target = event.target as Element
    if (!event.currentTarget.contains(target) || target.getAttribute("aria-expanded") === "true") return
    event.preventDefault()
    cancel()
  }

  // Nothing to test until something is set up
  const footerTest = editing || !notSetUp ? onTest : undefined

  let body: ReactNode = children
  if (form) {
    if (editing) {
      body = (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape leaves edit mode while focus is inside the form (Atlassian and Primer edit patterns)
        <form
          id={formId}
          ref={formRef}
          aria-labelledby={`${id}-title`}
          // Errors show on their fields, and a blocked submit still reaches the server
          noValidate
          onSubmit={submit}
          onKeyDown={onKeyDown}
          className="flex flex-col gap-6"
          data-testid={formId}
        >
          {children}
        </form>
      )
    } else if (notSetUp) {
      body = (
        <p className="text-ui text-muted-foreground" data-testid={`settings-${id}-empty`}>
          Not set up.
        </p>
      )
    } else {
      body = typeof view === "function" ? view(mode.requestEdit) : view
    }
  }

  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)} data-testid={`settings-${id}-section`}>
      <Card data-editing={editing || undefined} className="data-editing:border-primary-indicator">
        <CardHeader className="pb-2">
          <CardTitle as="h2" id={`${id}-title`}>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
          {(status || form) && (
            <CardAction className="flex items-start gap-3 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:justify-self-start">
              {status && <SectionStatus id={id} status={status} checkedAt={checkedAt} />}
              {form &&
                (editing ? (
                  <Badge variant="info" data-testid={`settings-${id}-editing`}>
                    Editing
                  </Badge>
                ) : (
                  <Button
                    ref={editRef}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="scroll-mt-24"
                    onClick={() => mode.requestEdit()}
                    data-testid={`settings-${id}-edit`}
                  >
                    {notSetUp ? "Set up" : "Edit"}
                    <span className="sr-only"> {title}</span>
                  </Button>
                ))}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {live}
          {body}
          {after}
        </CardContent>
        {(editing || footerTest || footerMeta) && (
          <SettingsFormFooter
            id={id}
            title={title}
            form={form}
            editing={editing}
            onCancel={cancel}
            formId={formId}
            onTest={footerTest}
            footerMeta={footerMeta}
          />
        )}
      </Card>
      {form && (
        <DiscardChangesDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={title}
          onDiscard={exit}
          data-testid={`settings-${id}-discard-dialog`}
        />
      )}
    </section>
  )
}

