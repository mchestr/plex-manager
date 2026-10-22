"use client"

import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useState } from "react"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { StatusBadge } from "@/components/ui/status-badge"
import { Time } from "@/components/ui/time"
import type { SettingsFormState } from "@/hooks/admin/use-settings-form"
import { icons } from "@/lib/ui/icons"
import { resolveStatus, type ConnectionStatus } from "@/lib/ui/status"
import { cn } from "@/lib/utils"

/** A Test connection outcome, as copy (never an upstream message). */
export interface TestResult {
  ok: boolean
  message: string
  /** The fix for a failure, shown in the inline Alert under `message`. */
  detail?: string
}

/** Collects each section's dirty flag for the section nav's "Unsaved changes" pip. */
const DirtyContext = createContext<((id: string, dirty: boolean) => void) | null>(null)

export function SettingsDirtyProvider({
  onDirtyChange,
  children,
}: {
  onDirtyChange: (id: string, dirty: boolean) => void
  children: ReactNode
}) {
  return <DirtyContext.Provider value={onDirtyChange}>{children}</DirtyContext.Provider>
}

function SectionStatus({ status, checkedAt }: { status: ConnectionStatus; checkedAt?: string | Date | null }) {
  const sub = resolveStatus("connection", status).sub
  const showChecked = checkedAt && status !== "notConfigured" && status !== "disabled"
  return (
    <span className="flex flex-col items-start gap-0.5 sm:items-end">
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

interface SettingsFormFooterProps {
  /** The section id; test ids are `settings-<id>-test`, `-save`, `-discard` and `-unsaved`. */
  id: string
  form?: SettingsFormState
  onTest?: () => Promise<TestResult>
  footerMeta?: ReactNode
  className?: string
}

/**
 * A settings form's footer (5.5): the test result (`role="status"`), the
 * "Unsaved changes" pip or `footerMeta` on the left; Discard, Test connection
 * and Save changes on the right. Below `sm` it stacks full width, primary last.
 * Place it inside the `<form>`, since Save submits.
 */
export function SettingsFormFooter({ id, form, onTest, footerMeta, className }: SettingsFormFooterProps) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const dirty = Boolean(form?.isDirty)
  const blocked = Boolean(form?.blockedReason)

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
            {form?.blockedReason && <span>{form.blockedReason}</span>}
          </p>
        ) : (
          footerMeta
        )}
      </div>
      {dirty && form && (
        <Button type="button" variant="ghost" onClick={form.onDiscard} disabled={form.isPending} data-testid={`settings-${id}-discard`}>
          Discard
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
          disabled={blocked}
          data-testid={`settings-${id}-test`}
        >
          Test connection
        </Button>
      )}
      {form && (
        <Button type="submit" disabled={!dirty || blocked} loading={form.isPending} loadingLabel="Saving" data-testid={`settings-${id}-save`}>
          Save changes
        </Button>
      )}
    </CardFooter>
  )
}

interface SettingsSectionProps extends Omit<SettingsFormFooterProps, "className"> {
  /** The anchor for the section nav, with `scroll-margin-top`; the root is `settings-<id>-section`. */
  id: string
  title: string
  description: ReactNode
  /** The section's health from `lib/ui/status.ts`. Left out for a section with nothing to check. */
  status?: ConnectionStatus
  /** When `status` was checked: "Checked 4 minutes ago". */
  checkedAt?: string | Date | null
  children: ReactNode
  className?: string
}

/**
 * One settings section (ui-design-system 5.5 and 6.4): a card with the title,
 * the connection badge and "Checked ..." in the header, the fields, and the
 * {@link SettingsFormFooter}. Save is disabled until the form is dirty; a
 * dirty form shows the "Unsaved changes" pip and Discard, and reports itself
 * to the section nav. `form.blockedReason` disables Test and Save and says why;
 * a submit that gets past it still reaches the server, which refuses on the
 * same rule (SEC-31). Leave `form` out for controls that save themselves.
 */
export function SettingsSection({ id, title, description, status, checkedAt, children, footerMeta, onTest, form, className }: SettingsSectionProps) {
  const reportDirty = useContext(DirtyContext)
  const dirty = Boolean(form?.isDirty)

  useEffect(() => {
    reportDirty?.(id, dirty)
  }, [reportDirty, id, dirty])
  useEffect(() => () => reportDirty?.(id, false), [reportDirty, id])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (form?.isDirty) form.onSave()
  }

  const body = (
    <>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
      {(form || onTest || footerMeta) && <SettingsFormFooter id={id} form={form} onTest={onTest} footerMeta={footerMeta} />}
    </>
  )

  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)} data-testid={`settings-${id}-section`}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" id={`${id}-title`}>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
          {status && (
            <CardAction className="max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:justify-self-start" data-testid={`settings-${id}-status`}>
              <SectionStatus status={status} checkedAt={checkedAt} />
            </CardAction>
          )}
        </CardHeader>
        {/* noValidate: errors show on their fields, and a blocked submit still reaches the server */}
        {form ? (
          <form onSubmit={submit} noValidate>
            {body}
          </form>
        ) : (
          body
        )}
      </Card>
    </section>
  )
}
