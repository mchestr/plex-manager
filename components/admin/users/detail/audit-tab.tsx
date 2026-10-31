import Link from "next/link"

import { Button } from "@/components/ui/button"
import { auditEvent, auditLog } from "@/lib/admin/routes"
import { getMemberAuditEvents, type MemberAuditRow } from "@/lib/data/audit-log"
import type { BoundFormat } from "@/lib/utils/format"

/** The events the tab lists; the audit log has the rest. */
const LIMIT = 20

/** Who acted, from the member's side: "By them", or "About them, by System". */
function involvement(row: MemberAuditRow): string {
  if (row.role === "subject") return `About them, by ${row.actor.name}`
  return row.member && row.member.id !== row.actor.id ? `By them, about ${row.member.name}` : "By them"
}

/**
 * The latest audit events by or about the member, each opening its event
 * page, and the audit log scoped to them. Admins only: the page around it
 * checks `assertAdmin()`, and so does the loader.
 */
export async function AuditTab({ userId, f }: { userId: string; f: BoundFormat }) {
  const { rows, total } = await getMemberAuditEvents(userId, { limit: LIMIT, f })

  return (
    <section aria-labelledby="admin-user-audit-heading" className="flex flex-col gap-3" data-testid="admin-user-audit">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="admin-user-audit-heading" className="text-h3">
          Latest events
        </h2>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={auditLog({ member: userId })} />}
          data-testid="admin-user-audit-open-log"
        >
          Open in the audit log
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-ui text-muted-foreground" data-testid="admin-user-audit-empty">
          No audit events by or about this member yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table aria-label="Latest audit events" className="w-full border-collapse text-ui">
            <thead className="border-b">
              <tr>
                {["Time", "Event", "Summary"].map((label) => (
                  <th key={label} scope="col" className="h-10 px-4 text-left text-label font-medium text-muted-foreground">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} data-testid={`admin-user-audit-row-${row.id}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={auditEvent(row.id)}
                      className="rounded-sm font-medium text-foreground hover:underline"
                      data-testid={`admin-user-audit-${row.id}-timestamp`}
                    >
                      {f.dateTime(row.createdAt, { zoneLabel: true })}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {row.label}
                    <span className="block text-label text-muted-foreground">{involvement(row)}</span>
                  </td>
                  <td className="px-4 py-3">{row.summary ?? <span className="text-muted-foreground">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > rows.length && (
        <p className="text-label text-muted-foreground" data-testid="admin-user-audit-more">
          The latest {f.number(rows.length)} of {f.number(total)} events. The audit log has them all.
        </p>
      )}
    </section>
  )
}
