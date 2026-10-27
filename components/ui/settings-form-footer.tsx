"use client"

import { type ReactNode, useState } from "react"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CardFooter } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import type { SettingsFormState } from "@/hooks/admin/use-settings-form"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** A Test connection outcome, as copy (never an upstream message). */
export interface TestResult {
  ok: boolean
  message: string
  /** The fix for a failure, shown in the inline Alert under `message`. */
  detail?: string
}

interface SettingsFormFooterProps {
  /** Test ids are `settings-<id>-test`, `-save`, `-cancel`, `-unsaved` and `-test-result`. */
  id: string
  /** The section or Sheet title, which ends each button's accessible name: "Test connection for Plex server". */
  title?: string
  form?: SettingsFormState
  /** The form is open: Save and Cancel show. Left out, only Test connection and the meta do (view mode). */
  editing?: boolean
  /** Leaves the form; the caller asks first when it is dirty. */
  onCancel?: () => void
  /** Save submits this form when the footer sits outside it. */
  formId?: string
  onTest?: () => Promise<TestResult>
  footerMeta?: ReactNode
  className?: string
}

/** A visible word, then the section for screen readers (WCAG 2.5.3: the visible label starts the name). */
function Named({ children, suffix }: { children: ReactNode; suffix?: string }) {
  return (
    <>
      {children}
      {suffix && <span className="sr-only"> {suffix}</span>}
    </>
  )
}

/**
 * A settings form's footer (ui-design-system 5.5). On the left, the test
 * result (`role="status"`, mounted in both modes so results are announced),
 * then the "Unsaved changes" pip while dirty or `footerMeta`. On the right,
 * Test connection in both modes and, while editing, Cancel and Save
 * changes. Save is enabled even with nothing changed (Primer, "Saving"),
 * except while `form.blockedReason` holds it (SEC-31). Below `sm` it stacks
 * full width, primary last.
 */
export function SettingsFormFooter({ id, title, form, editing = false, onCancel, formId, onTest, footerMeta, className }: SettingsFormFooterProps) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const dirty = editing && Boolean(form?.isDirty)
  const blockedReason = form?.blockedReason

  const test = async () => {
    if (!onTest) return
    setTesting(true)
    setResult(null)
    try {
      setResult(await onTest())
    } finally {
      setTesting(false)
    }
  }

  return (
    <CardFooter className={cn("flex-col items-stretch gap-3 pt-4 sm:flex-row sm:items-center", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-label text-muted-foreground">
        <div role="status" className="empty:hidden" data-testid={`settings-${id}-test-result`}>
          {result?.ok && (
            <p className="flex items-start gap-2">
              <Icon icon={icons.success} className="mt-0.5 text-success" />
              <span className="text-foreground">{result.message}</span>
            </p>
          )}
          {result && !result.ok && (
            // Inside the status region, so it is announced once, politely
            <Alert tone="warning" role="presentation" title={result.message}>
              {result.detail}
            </Alert>
          )}
        </div>
        {dirty ? (
          <p className="flex flex-wrap items-center gap-x-2" data-testid={`settings-${id}-unsaved`}>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary-indicator" />
            <span className="text-foreground">Unsaved changes</span>
            {blockedReason && <span>{blockedReason}</span>}
          </p>
        ) : blockedReason && onTest ? (
          <p data-testid={`settings-${id}-blocked`}>{blockedReason}</p>
        ) : (
          footerMeta
        )}
      </div>
      {editing && onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={form?.isPending} data-testid={`settings-${id}-cancel`}>
          <Named suffix={title && `editing ${title}`}>Cancel</Named>
        </Button>
      )}
      {onTest && (
        <Button
          type="button"
          variant="secondary"
          icon={<Icon icon={icons.testConnection} />}
          onClick={() => void test()}
          loading={testing}
          loadingLabel="Testing"
          disabled={Boolean(blockedReason)}
          data-testid={`settings-${id}-test`}
        >
          <Named suffix={title && `for ${title}`}>Test connection</Named>
        </Button>
      )}
      {editing && form && (
        <Button
          type="submit"
          form={formId}
          disabled={Boolean(blockedReason)}
          loading={form.isPending}
          loadingLabel="Saving"
          data-testid={`settings-${id}-save`}
        >
          <Named suffix={title && `to ${title}`}>Save changes</Named>
        </Button>
      )}
    </CardFooter>
  )
}
