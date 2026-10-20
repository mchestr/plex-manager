import type { ReactNode } from "react"

/** One primitive on the sheet: a heading and its rows, with a `dev-ui-<primitive>` test id. */
export function Specimen({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`dev-ui-${id}-title`} data-testid={`dev-ui-${id}`} className="flex flex-col gap-4">
      <h2 id={`dev-ui-${id}-title`} className="text-h2">
        {title}
      </h2>
      <div className="flex flex-col gap-4 rounded-lg border p-5">{children}</div>
    </section>
  )
}

/** A labelled row of variants or states. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
      <p className="w-32 shrink-0 text-label text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
