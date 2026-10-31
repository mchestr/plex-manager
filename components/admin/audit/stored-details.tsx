import type { Prisma } from "@/lib/generated/prisma/client"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function Value({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="break-all">{value}</span>
  return <pre className="font-mono text-label whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
}

/**
 * An event's stored details for an admin, as plain text: one row per key, a
 * string as it is and anything else as indented JSON. Details that are not
 * an object show whole.
 */
export function StoredDetails({ details }: { details: Prisma.JsonValue | null }) {
  const entries = isRecord(details) ? Object.entries(details) : null
  if (details === null || entries?.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-ui text-muted-foreground" data-testid="admin-audit-event-details-empty">
        This event has no stored details.
      </p>
    )
  }
  if (!entries) {
    return (
      <div className="rounded-lg border bg-card p-4 text-ui" data-testid="admin-audit-event-details">
        <Value value={details} />
      </div>
    )
  }
  return (
    <dl className="flex flex-col divide-y rounded-lg border bg-card" data-testid="admin-audit-event-details">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
          <dt className="shrink-0 font-mono text-label break-all text-muted-foreground sm:w-48">{key}</dt>
          <dd className="min-w-0 text-ui text-foreground">
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
