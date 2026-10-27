import type { ReactNode } from "react"

/** One labelled fact in a user detail `<dl>`. */
export function DetailItem({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="text-ui text-foreground" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}
