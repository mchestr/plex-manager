"use client"

import { kebab } from "@/components/admin/cleanup/editor/condition-editor/editor-parts"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { type EditorError, summaryLine, summaryTitle } from "@/lib/cleanup/editor/errors"

interface ErrorSummaryProps {
  errors: readonly EditorError[]
  /** A link: focus the token with the error and open its editor (UX 7.7 item 5, UX 7.9). */
  onSelect: (key: string) => void
}

/**
 * The Save error summary at the top of the builder (UX 7.7 item 5): a
 * destructive alert, "Fix 2 things before you save", with one link for each
 * problem. It takes focus after a Save with errors (`tabIndex={-1}`); a link
 * moves focus to the token and opens its editor. It renders nothing without
 * errors.
 */
export function ErrorSummary({ errors, onSelect }: ErrorSummaryProps) {
  if (errors.length === 0) return null
  return (
    <Alert
      tone="destructive"
      role="alert"
      tabIndex={-1}
      title={summaryTitle(errors.length)}
      className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="admin-cleanup-error-summary"
    >
      <ul className="mt-1 flex flex-col items-start gap-0.5">
        {errors.map((error) => (
          <li key={error.key}>
            <Button
              variant="link"
              size="sm"
              onClick={() => onSelect(error.key)}
              className="h-auto px-0 text-left whitespace-normal text-destructive"
              data-testid={`admin-cleanup-error-link-${kebab(error.key)}`}
            >
              {summaryLine(error)}
            </Button>
          </li>
        ))}
      </ul>
    </Alert>
  )
}
