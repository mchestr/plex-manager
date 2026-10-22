"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { EvalResults, FixtureResult, JudgeScores } from "@/evals/rewind/results-schema"
import type { EvalRun } from "@/lib/admin/eval-results"
import { useFormat } from "@/lib/format-context"

type Issue = EvalResults["gates"]["issues"][number]

const DIMENSIONS: Array<keyof JudgeScores> = ["voice", "specificity", "warmth", "restraint", "faithfulness"]

function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-label text-destructive">
      {issues.map((issue, i) => (
        <li key={i}>
          {issue.check}
          {issue.slot ? ` (${issue.slot})` : ""}: {issue.message}
        </li>
      ))}
    </ul>
  )
}

function FixtureOutput({ fixture, issues }: { fixture: FixtureResult; issues: Issue[] }) {
  const f = useFormat()
  return (
    <section className="flex flex-col gap-3 border-t pt-4" data-testid={`admin-evals-fixture-${fixture.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h3 text-foreground">{fixture.id}</h3>
        <Badge>{fixture.edition}</Badge>
        {fixture.archetype && <span className="text-label text-muted-foreground">{fixture.archetype}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-label">
        <dt className="text-muted-foreground">Copy from</dt>
        <dd>{fixture.copySource}</dd>
        <dt className="text-muted-foreground">Failed first pass</dt>
        <dd>{fixture.firstPassFailed.length > 0 ? fixture.firstPassFailed.join(", ") : "None"}</dd>
        <dt className="text-muted-foreground">Failed after repair</dt>
        <dd>{fixture.afterRepairFailed.length > 0 ? fixture.afterRepairFailed.join(", ") : "None"}</dd>
        <dt className="text-muted-foreground">Latency</dt>
        <dd className="tabular-nums">{f.number(fixture.latencyMs / 1000, { maximumFractionDigits: 1 })} s</dd>
        <dt className="text-muted-foreground">Cost</dt>
        <dd className="tabular-nums">{f.money(fixture.costUsd, "table")}</dd>
        {fixture.judge && (
          <>
            <dt className="text-muted-foreground">Judge</dt>
            <dd className="tabular-nums">{f.number(fixture.judge.mean, { maximumFractionDigits: 2 })}</dd>
          </>
        )}
      </dl>
      {fixture.reason && <p className="text-label text-muted-foreground">{fixture.reason}</p>}
      <IssueList issues={issues} />
      {fixture.judge?.notes && <p className="text-label text-muted-foreground">Judge notes: {fixture.judge.notes}</p>}
      {fixture.copy.length > 0 && (
        <ul className="flex flex-col gap-2">
          {fixture.copy.map((slot) => (
            <li key={slot.slot} className="flex flex-col gap-0.5">
              <span className="text-caption text-muted-foreground">
                {slot.slot}, from {slot.origin}
              </span>
              <span className="text-ui text-foreground">{slot.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One run's per-fixture outputs and their issues, opened from its model cell. */
export function EvalRunSheet({ run }: { run: EvalRun }) {
  const f = useFormat()
  const { results, judgeScores } = run
  const runIssues = results.gates.issues.filter((issue) => issue.fixture === null)

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="link" size="sm" className="h-auto px-0 font-mono" data-testid={`admin-evals-open-${run.id}`} />}>
        {results.model}
      </SheetTrigger>
      <SheetContent side="right" className="max-w-[560px]" data-testid={`admin-evals-sheet-${run.id}`}>
        <SheetHeader>
          <SheetTitle className="font-mono">{results.model}</SheetTitle>
          <SheetDescription>
            {results.promptVersion}, {results.source === "replay" ? `replay of ${results.recordings ?? "a recording set"}` : "live"}, started{" "}
            {f.dateTime(results.startedAt)}
            {run.fileName ? `, ${run.fileName}` : ""}
          </SheetDescription>
        </SheetHeader>
        {judgeScores && (
          <p className="text-label text-muted-foreground" data-testid="admin-evals-judge-scores">
            {DIMENSIONS.map((dim) => `${dim} ${f.number(judgeScores[dim], { maximumFractionDigits: 1 })}`).join(", ")}
          </p>
        )}
        <IssueList issues={runIssues} />
        {results.fixtures.map((fixture) => (
          <FixtureOutput key={fixture.id} fixture={fixture} issues={results.gates.issues.filter((issue) => issue.fixture === fixture.id)} />
        ))}
      </SheetContent>
    </Sheet>
  )
}
