import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** The three steps of UX 8.2: a title and one line each. */
export const CLEANUP_STEPS = [
  { title: "Pick a recipe", line: "Set 2 or 3 values and see today's matches. The rule saves in Dry run." },
  { title: "Watch a dry run", line: "Each night records the matches of the rule. Check the matches and why each one matched." },
  {
    title: "Turn it on",
    line: "Matches wait in Leaving soon for 30 days. Members can keep them. Then Radarr or Sonarr deletes them.",
  },
] as const

/**
 * The steps strip of the first-use state (UX 4.1.1): how a rule goes from a
 * recipe to deletions, as an ordered list in one card. Step 1, where the
 * admin is, has the filled number. The three columns stack below `md`.
 */
export function CleanupSteps() {
  return (
    <Card data-testid="admin-cleanup-steps">
      <ol aria-label="How media cleanup starts" className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        {CLEANUP_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 px-5 py-4">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-label font-semibold tabular-nums",
                i === 0 ? "bg-primary text-primary-foreground" : "border border-border-strong text-muted-foreground"
              )}
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-ui font-semibold text-foreground">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </p>
              <p className="text-label text-muted-foreground">{step.line}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
