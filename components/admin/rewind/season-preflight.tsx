import { StatusBadge } from "@/components/ui/status-badge"
import type { PreflightRow } from "@/lib/wrapped/admin/preflight"

/** The preflight rows (P7.8): one status per thing a season run needs. */
export function SeasonPreflight({ rows }: { rows: PreflightRow[] }) {
  return (
    <section aria-labelledby="season-preflight-heading" className="flex flex-col gap-3" data-testid="admin-rewind-preflight">
      <h2 id="season-preflight-heading" className="text-h3">
        Preflight
      </h2>
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            data-testid={`admin-rewind-preflight-${row.id}`}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-ui font-medium text-foreground">{row.label}</span>
              <span className="text-label text-muted-foreground">{row.detail}</span>
            </div>
            <StatusBadge domain="connection" value={row.status} sub="" className="shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  )
}
