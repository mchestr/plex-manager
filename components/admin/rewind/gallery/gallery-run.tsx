"use client"

import type { Route } from "next"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import type { z } from "zod"

import { getRewindDryRun, startRewindDryRun } from "@/actions/admin/rewind-playground"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { DryRunInput } from "@/lib/rewind/dry-run/input"

const POLL_MS = 2000

type Input = z.input<typeof DryRunInput>
type Outcome = { kind: "completed"; id: string } | { kind: "failed"; message: string }

interface GalleryRunProps {
  /** Where this tab's preview id is remembered for the session: `<fixture>:<copy>`. */
  runKey: string
  input: Input
}

const storageKey = (runKey: string) => `rewind-gallery:${runKey}`

function remembered(runKey: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(runKey))
  } catch {
    return null
  }
}

function remember(runKey: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(storageKey(runKey), id)
    else sessionStorage.removeItem(storageKey(runKey))
  } catch {
    // The run still opens; only the reuse after a reload is lost.
  }
}

// A start in flight, per tab, so an effect that runs twice queues one run.
const starting = new Map<string, ReturnType<typeof startRewindDryRun>>()

function start(runKey: string, input: Input) {
  let pending = starting.get(runKey)
  if (!pending) {
    pending = startRewindDryRun(input).finally(() => starting.delete(runKey))
    starting.set(runKey, pending)
  }
  return pending
}

/**
 * Reuses the remembered run when asked and it still exists, or starts one,
 * then polls it to its end. Null when cancelled.
 */
async function runToEnd(runKey: string, input: Input, reuse: boolean, cancelled: () => boolean): Promise<Outcome | null> {
  let id = reuse ? remembered(runKey) : null
  for (;;) {
    if (!id) {
      const started = await start(runKey, input)
      if (!started.success) return cancelled() ? null : { kind: "failed", message: started.error }
      id = started.data.previewId
      remember(runKey, id)
      reuse = false
    }
    if (cancelled()) return null
    const result = await getRewindDryRun({ id })
    if (cancelled()) return null
    if (!result.success) {
      remember(runKey, null)
      // A remembered run that expired starts a new one; a new one that vanished is a failure.
      if (!reuse) return { kind: "failed", message: result.error }
      id = null
      reuse = false
      continue
    }
    const stored = result.data
    if (stored.status === "completed") return { kind: "completed", id }
    if (stored.status === "skipped") return { kind: "failed", message: `The dry run was skipped: ${stored.reason}` }
    if (stored.status === "failed") return { kind: "failed", message: `The dry run failed: ${stored.code}` }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

/**
 * Starts or reuses this tab's dry run (P7.10's `REWIND_DRY_RUN`), polls it
 * and, once it completes, puts its id in the address as `preview`, so the
 * server renders the frames and cards. A remembered id that expired starts
 * a new run.
 */
export function GalleryRun({ runKey, input }: GalleryRunProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [failure, setFailure] = useState<string | null>(null)

  const finish = useCallback(
    (outcome: Outcome | null) => {
      if (!outcome) return
      if (outcome.kind === "failed") return setFailure(outcome.message)
      const params = new URLSearchParams(searchParams.toString())
      params.set("preview", outcome.id)
      router.replace(`${pathname}?${params.toString()}` as Route)
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    let stop = false
    void runToEnd(runKey, input, true, () => stop).then(finish)
    return () => {
      stop = true
    }
  }, [finish, input, runKey])

  if (failure !== null) {
    return (
      <Alert
        tone="destructive"
        title="No preview for this fixture"
        data-testid="rewind-gallery-failed"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailure(null)
              void runToEnd(runKey, input, false, () => false).then(finish)
            }}
          >
            Run again
          </Button>
        }
      >
        {failure}
      </Alert>
    )
  }

  return (
    <p className="flex items-center gap-2 text-ui text-muted-foreground" data-testid="rewind-gallery-running">
      <Spinner />
      Running the dry run. A fixture takes up to a minute and a half.
    </p>
  )
}
