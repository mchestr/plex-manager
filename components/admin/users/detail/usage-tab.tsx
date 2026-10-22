import Link from "next/link"

import { Button } from "@/components/ui/button"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { llmUsage, llmUsageDetail } from "@/lib/admin/routes"
import { getUserUsage } from "@/lib/admin/user-detail-tabs"
import type { BoundFormat } from "@/lib/utils/format"

/** The member's LLM requests, tokens and cost, and their ten latest requests (P10.6). */
export async function UsageTab({ userId, f }: { userId: string; f: BoundFormat }) {
  const usage = await getUserUsage(userId)

  return (
    <div className="flex flex-col gap-6">
      <StatGrid data-testid="admin-user-usage-stats">
        <StatTile label="Requests" value={f.number(usage.requests)} />
        <StatTile label="Tokens" value={f.number(usage.tokens)} />
        <StatTile label="Cost" value={f.money(usage.costUsd)} />
      </StatGrid>

      <section aria-labelledby="admin-user-usage-latest" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="admin-user-usage-latest" className="text-h3">
            Latest requests
          </h2>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={llmUsage({ userId })} />} data-testid="admin-user-usage-all">
            View all in LLM usage
          </Button>
        </div>
        {usage.latest.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-ui text-muted-foreground">No LLM requests for this member yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table aria-label="Latest LLM requests" className="w-full border-collapse text-ui">
              <thead className="border-b">
                <tr>
                  {["Time", "Model", "Tokens", "Cost"].map((label, index) => (
                    <th key={label} scope="col" className={index >= 2 ? "h-10 px-4 text-right text-label font-medium text-muted-foreground" : "h-10 px-4 text-left text-label font-medium text-muted-foreground"}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {usage.latest.map((row) => (
                  <tr key={row.id} data-testid={`admin-user-usage-row-${row.id}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link data-testid={`admin-user-usage-${row.id}`} href={llmUsageDetail(row.id)} className="rounded-sm font-medium text-foreground hover:underline">
                        {f.dateTime(row.createdAt, { zoneLabel: true })}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {row.provider}/{row.model ?? "unknown"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.number(row.totalTokens)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.money(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
