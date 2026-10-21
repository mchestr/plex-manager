import { Badge } from "@/components/ui/badge"
import type { PlaygroundIssue, PlaygroundSlot, PlaygroundView, SlotOutcome } from "@/lib/rewind/playground/view"
import type { CopySegment } from "@/lib/wrapped/copy/render-copy"

const OUTCOME: Record<SlotOutcome, { label: string; variant: "success" | "warning" | "destructive" }> = {
  kept: { label: "As written", variant: "success" },
  repaired: { label: "Repaired", variant: "warning" },
  fallback: { label: "Template fallback", variant: "destructive" },
}

/** Copy with each token marked and named by its fact id, so a title stays visibly inside its token. */
function HighlightedCopy({ segments }: { segments: readonly CopySegment[] }) {
  return segments.map((segment, i) =>
    segment.kind === "text" ? (
      segment.text
    ) : (
      <mark
        key={i}
        title={segment.id}
        data-fact-id={segment.id}
        className="rounded-sm bg-info-subtle px-0.5 text-info data-[kind=title]:italic"
        data-kind={segment.kind}
      >
        {segment.text}
      </mark>
    )
  )
}

function IssueList({ issues }: { issues: readonly PlaygroundIssue[] }) {
  return (
    <ul className="flex flex-col gap-1 text-label">
      {issues.map((issue, i) => (
        <li key={i} data-testid="playground-issue">
          <span className="font-medium text-destructive">Rule {issue.rule}</span>{" "}
          <span className="text-foreground">{issue.message}</span>
          <span className="text-muted-foreground"> {issue.hint}</span>
        </li>
      ))}
    </ul>
  )
}

function SlotRow({ slot }: { slot: PlaygroundSlot }) {
  const outcome = OUTCOME[slot.outcome]
  return (
    <li className="flex flex-col gap-1.5 border-b py-3 last:border-b-0" data-testid={`playground-slot-${slot.slot}`}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-label text-muted-foreground">{slot.slot}</code>
        <Badge variant={outcome.variant}>{outcome.label}</Badge>
      </div>
      <p className="text-body text-foreground">
        <HighlightedCopy segments={slot.segments} />
      </p>
      {slot.issues.length > 0 && <IssueList issues={slot.issues} />}
    </li>
  )
}

/** The model's raw answer, the copy as printed with its tokens marked, and the grounding trail per slot. */
export function CopyPane({ view }: { view: Pick<PlaygroundView, "raw" | "copy" | "otherIssues"> }) {
  return (
    <section aria-labelledby="playground-copy" className="flex flex-col gap-6" data-testid="playground-copy">
      <div className="flex flex-col gap-3">
        <h2 id="playground-copy" className="text-h3 font-semibold text-foreground">
          Copy
        </h2>
        {view.copy.length > 0 ? (
          <ol className="rounded-lg border bg-card px-4">
            {view.copy.map((slot) => (
              <SlotRow key={slot.slot} slot={slot} />
            ))}
          </ol>
        ) : (
          <p className="text-ui text-muted-foreground">This edition prints no written copy.</p>
        )}
        {view.otherIssues.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="playground-other-issues">
            <h3 className="text-ui font-semibold text-foreground">Other grounding issues</h3>
            <IssueList issues={view.otherIssues} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-ui font-semibold text-foreground">Raw output</h3>
        {view.raw ? (
          <pre className="max-h-96 overflow-auto rounded-lg border bg-muted p-4 font-mono text-label text-foreground" data-testid="playground-raw">
            {view.raw}
          </pre>
        ) : (
          <p className="text-ui text-muted-foreground" data-testid="playground-raw-none">
            No model ran, so there is no raw output.
          </p>
        )}
      </div>
    </section>
  )
}
