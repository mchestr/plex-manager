"use client"

import { useId, useState } from "react"

import { Button } from "@/components/ui/button"

import { useHideTitles, type HiddenTitle } from "./hide-context"

/**
 * The Settings sheet's "Hidden titles" (P7.7): each hidden title with
 * "Unhide" beside it. Renders nothing outside a `HideProvider`.
 */
export function HiddenTitles() {
  const hiding = useHideTitles()
  const id = useId()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!hiding) return null

  const unhide = async (title: HiddenTitle) => {
    setPending(title.ratingKey)
    setError(null)
    setError(await hiding.unhide(title))
    setPending(null)
  }

  return (
    <section aria-labelledby={`${id}-hidden`} className="flex flex-col gap-2 border-t border-border pt-4" data-testid="rewind-hidden-titles">
      <h3 id={`${id}-hidden`} className="text-ui font-semibold">
        Hidden titles
      </h3>
      {hiding.hidden.length === 0 ? (
        <p className="font-text text-ui text-muted-foreground">You have not hidden any titles.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {hiding.hidden.map((title) => (
            <li key={title.ratingKey} className="flex items-center justify-between gap-4">
              <span dir="auto" className="min-w-0 truncate font-text text-ui">
                {title.title ?? "A hidden title"}
              </span>
              <Button
                variant="ink-outline"
                size="pill"
                disabled={pending !== null}
                onClick={() => void unhide(title)}
                data-testid={`rewind-unhide-${title.ratingKey}`}
              >
                {pending === title.ratingKey ? "Unhiding" : "Unhide"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="font-text text-ui text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
