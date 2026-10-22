/** The "New" pip (UI-25): an indicator square, read as "New" by screen readers. */
export function NewPip({ "data-testid": testId }: { "data-testid"?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center" data-testid={testId}>
      <span aria-hidden="true" className="size-2 bg-primary-indicator" />
      <span className="sr-only">New</span>
    </span>
  )
}
