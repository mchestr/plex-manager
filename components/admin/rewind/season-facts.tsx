import type { ReactNode } from "react"

export interface SeasonFactsProps {
  opens: string
  closes: string
  /** "1 January to 30 November 2026, in each member's zone" */
  dataWindow: string
  model: string
  promptVersion: string
  /** "02:15 in America/Chicago, which is 00:15 in America/Los_Angeles", or why nothing is scheduled. */
  prepareRuns: string
  dataPreparedAt: string
  flags: { label: string; value: string }[]
}

function Fact({ term, children, testId }: { term: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label text-muted-foreground">{term}</dt>
      <dd className="text-ui text-foreground" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}

/** The season's dates, data window, model, prompt version, flags and the season-open run (P7.8). */
export function SeasonFacts({ opens, closes, dataWindow, model, promptVersion, prepareRuns, dataPreparedAt, flags }: SeasonFactsProps) {
  return (
    <section aria-labelledby="season-facts-heading" className="flex flex-col gap-3" data-testid="admin-rewind-season-facts">
      <h2 id="season-facts-heading" className="text-h3">
        Season
      </h2>
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact term="Opens">{opens}</Fact>
        <Fact term="Closes">{closes}</Fact>
        <Fact term="Data window">{dataWindow}</Fact>
        <Fact term="Model">{model}</Fact>
        <Fact term="Prompt version">{promptVersion}</Fact>
        <Fact term="Season data prepared">{dataPreparedAt}</Fact>
        <Fact term="Season-open run" testId="admin-rewind-prepare-schedule">
          {prepareRuns}
        </Fact>
        {flags.map((flag) => (
          <Fact key={flag.label} term={flag.label}>
            {flag.value}
          </Fact>
        ))}
      </dl>
    </section>
  )
}
