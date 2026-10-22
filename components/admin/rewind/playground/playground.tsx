"use client"

import { useQuery } from "@tanstack/react-query"
import type { Route } from "next"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, type ReactNode } from "react"

import { estimateRewindDryRun, getRewindDryRun, startRewindDryRun } from "@/actions/admin/rewind-playground"
import { Alert } from "@/components/ui/alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Spinner } from "@/components/ui/spinner"
import { queryKeys } from "@/hooks/query-keys"
import { useFormat } from "@/lib/format-context"

import { PlaygroundForm, type PlaygroundOptions } from "./playground-form"
import { toDryRunRequest, usePlayground, type PlaygroundForm as FormState } from "./use-playground"

const POLL_MS = 2000

interface PlaygroundProps {
  initialForm: FormState
  options: PlaygroundOptions
  /** The finished run's panes, rendered on the server from `?preview=`. */
  children?: ReactNode
}

/**
 * The playground (P8.8, design 10.2): the form, then P7.10's dry run. A paid
 * run shows its estimate in a confirm first; the run is polled with TanStack
 * Query, and once it completes its id goes into the address as `preview`, so
 * the server renders the panes from the stored trail.
 */
export function Playground({ initialForm, options, children }: PlaygroundProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const format = useFormat()
  const { state, dispatch, busy } = usePlayground(initialForm)
  const { form, phase } = state
  const runningId = phase.kind === "running" ? phase.id : null

  const request = () =>
    toDryRunRequest(form, {
      year: form.subject === "fixture" ? (options.fixtures.find((f) => f.id === form.fixtureId)?.year ?? options.memberYear) : options.memberYear,
      styleGuides: options.styleGuides,
    })

  const start = async () => {
    dispatch({ type: "starting" })
    const started = await startRewindDryRun(request())
    dispatch(started.success ? { type: "running", id: started.data.previewId } : { type: "failed", message: started.error })
  }

  const run = async () => {
    dispatch({ type: "estimating" })
    const estimate = await estimateRewindDryRun(request())
    if (!estimate.success) return dispatch({ type: "failed", message: estimate.error })
    if (estimate.data.llm) return dispatch({ type: "confirm", estimate: estimate.data })
    await start()
  }

  const poll = useQuery({
    queryKey: queryKeys.rewindDryRun(runningId),
    queryFn: () => getRewindDryRun({ id: runningId ?? "" }),
    enabled: runningId !== null,
    refetchInterval: (query) => (query.state.data?.success && query.state.data.data.status === "pending" ? POLL_MS : false),
  })

  useEffect(() => {
    const result = poll.data
    if (!runningId || !result) return
    if (!result.success) return dispatch({ type: "failed", message: result.error })
    const stored = result.data
    if (stored.status === "pending") return
    if (stored.status === "skipped") return dispatch({ type: "failed", message: `The dry run was skipped: ${stored.reason}` })
    if (stored.status === "failed") return dispatch({ type: "failed", message: `The dry run failed: ${stored.code}` })
    dispatch({ type: "finished" })
    const params = new URLSearchParams(searchParams.toString())
    params.set("preview", runningId)
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false })
  }, [dispatch, pathname, poll.data, router, runningId, searchParams])

  return (
    <div className="flex flex-col gap-6">
      <PlaygroundForm form={form} options={options} busy={busy} onChange={(patch) => dispatch({ type: "set", patch })} onRun={() => void run()} />
      {phase.kind === "confirming" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && dispatch({ type: "cancel" })}
          title="Run a paid dry run?"
          description={`This run calls ${phase.estimate.model} on ${phase.estimate.provider}: about ${format.money(phase.estimate.costUsd, "prose")}, at most ${format.money(phase.estimate.maxCostUsd, "prose")} with a repair call.`}
          confirmLabel="Run it"
          pendingLabel="Starting"
          action={async () => {
            await start()
            return {}
          }}
          data-testid="playground-estimate"
          confirmTestId="playground-estimate-confirm"
        />
      )}
      {phase.kind === "failed" && (
        <Alert tone="destructive" title="No dry run" data-testid="playground-failed">
          {phase.message}
        </Alert>
      )}
      {(phase.kind === "starting" || phase.kind === "running") && (
        <p className="flex items-center gap-2 text-ui text-muted-foreground" data-testid="playground-running">
          <Spinner />
          Running the dry run. It can take up to a minute and a half.
        </p>
      )}
      {children}
    </div>
  )
}
