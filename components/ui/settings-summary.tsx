import type { ComponentProps, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { SavedSecret } from "@/lib/security/saved-secret"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/**
 * A settings section's saved values in view mode (GOV.UK "Summary list"):
 * a `<dl>` laid out in the edit form's two-column grid, so Edit swaps each
 * value for its field in place (SLDS "view mode"). Values are text, never
 * disabled or read-only inputs (Carbon, "Read-only states").
 */
export function SettingsSummary({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2", className)} {...props} />
}

interface SettingsSummaryRowProps {
  label: ReactNode
  children: ReactNode
  /** Spans both columns: notes, lists, tables. */
  wide?: boolean
  /** URLs and IDs: monospaced and wrapped anywhere, never truncated. */
  mono?: boolean
  className?: string
  /** `settings-<section>-summary-<key>`. */
  "data-testid"?: string
}

/** One label and value of a {@link SettingsSummary}. */
export function SettingsSummaryRow({ label, children, wide, mono, className, "data-testid": testId }: SettingsSummaryRowProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "md:col-span-2", className)} data-testid={testId}>
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-ui text-foreground wrap-break-word", mono && "font-mono break-all")}>{children}</dd>
    </div>
  )
}

/** An empty value: "Not set", or what the field falls back to ("Model default"). Never a blank cell. */
export function NotSet({ children = "Not set" }: { children?: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

interface SecretSummaryProps {
  /** What the server says about the stored secret, from `describeSecret`. */
  saved: SavedSecret | null | undefined
  /** "API key", for the re-enter button's name. */
  noun: string
  /** What an unset secret reads as; "Not set" by default. */
  empty?: ReactNode
  /** Opens the section's form on this field; offered when the stored value can't be read. */
  onReenter?: () => void
  reenterTestId?: string
}

/**
 * A stored secret in view mode (SEC-31): the lock and "Saved, ends in 1234",
 * never the value. One the current encryption key can't read (P11.1) says
 * so, with "Enter it again" to open the field.
 */
export function SecretSummary({ saved, noun, empty, onReenter, reenterTestId }: SecretSummaryProps) {
  if (!saved) return <NotSet>{empty}</NotSet>
  if (saved.unreadable) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-warning">
          <Icon icon={icons.warning} size={12} />
          Can&apos;t be read with the current encryption key.
        </span>
        {onReenter && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onReenter} data-testid={reenterTestId}>
            Enter it again<span className="sr-only"> ({noun})</span>
          </Button>
        )}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      <Icon icon={icons.savedSecret} size={12} className="text-success" />
      {saved.last4 ? (
        <span>
          Saved, ends in <span className="font-mono">{saved.last4}</span>
        </span>
      ) : (
        "Saved"
      )}
    </span>
  )
}
