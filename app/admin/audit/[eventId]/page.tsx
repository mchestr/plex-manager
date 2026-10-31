import Link from "next/link"
import { notFound } from "next/navigation"

import { StoredDetails } from "@/components/admin/audit/stored-details"
import { DetailItem } from "@/components/admin/users/detail/detail-item"
import { PageHeader } from "@/components/ui/page-header"
import { assertPermission } from "@/lib/admin"
import { auditLog, userDetail } from "@/lib/admin/routes"
import { CATEGORY_LABELS } from "@/lib/audit/events"
import { type AuditParty, getAuditEvent } from "@/lib/data/audit-log"
import { getFormat } from "@/lib/settings/app-settings"

function Missing() {
  return <span className="text-muted-foreground">–</span>
}

interface PartyProps {
  party: AuditParty
  /** The log filter the name opens: events by them, or involving them. */
  scope: "actor" | "member"
  /** Admins also get the member's page; Support is refused it, so never sees the link. */
  admin: boolean
  testId: string
}

function Party({ party, scope, admin, testId }: PartyProps) {
  return (
    <span className="flex flex-col gap-1">
      <Link
        href={auditLog({ [scope]: party.id })}
        aria-label={`${scope === "actor" ? "Events by" : "Events involving"} ${party.name}`}
        className="w-fit rounded-sm font-medium hover:underline"
        data-testid={testId}
      >
        {party.name}
      </Link>
      {admin && party.kind === "user" && (
        <Link
          href={userDetail(party.id)}
          className="w-fit rounded-sm text-label text-muted-foreground hover:text-foreground hover:underline"
          data-testid={`${testId}-profile`}
        >
          View member
        </Link>
      )}
    </span>
  )
}

/**
 * One audit event: when, what, who acted and whom it was about, and its
 * summary. Admins also read every stored detail; Support is told the details
 * exist but never receives them. A name opens the log scoped to that person.
 */
export default async function AuditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await assertPermission("audit:read")
  const [{ eventId }, f] = await Promise.all([params, getFormat()])
  const event = await getAuditEvent(eventId, f)
  if (!event) notFound()
  const admin = session.user.isAdmin

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-audit-event-page">
      <PageHeader
        title={event.label}
        breadcrumbs={[{ label: "Audit log", href: auditLog() }, { label: event.label }]}
        data-testid="admin-audit-event-header"
      />
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="admin-audit-event">
        <DetailItem label="Time" testId="admin-audit-event-timestamp">
          {f.dateTime(event.createdAt, { zoneLabel: true })}
        </DetailItem>
        <DetailItem label="Event" testId="admin-audit-event-type">
          {event.label}
          <span className="block font-mono text-label break-all text-muted-foreground">{event.type}</span>
        </DetailItem>
        <DetailItem label="Category" testId="admin-audit-event-category">
          {event.category ? CATEGORY_LABELS[event.category] : <Missing />}
        </DetailItem>
        <DetailItem label="By">
          <Party party={event.actor} scope="actor" admin={admin} testId="admin-audit-event-actor" />
        </DetailItem>
        <DetailItem label="About">
          {event.member ? <Party party={event.member} scope="member" admin={admin} testId="admin-audit-event-member" /> : <Missing />}
        </DetailItem>
        <DetailItem label="Summary" testId="admin-audit-event-summary">
          {event.summary ?? <Missing />}
        </DetailItem>
      </dl>

      <section aria-labelledby="admin-audit-event-details-heading" className="flex flex-col gap-3">
        <h2 id="admin-audit-event-details-heading" className="text-h3">
          Stored details
        </h2>
        {event.detailsHidden ? (
          <p className="rounded-lg border bg-card p-4 text-ui text-muted-foreground" data-testid="admin-audit-event-details-hidden">
            Only admins can see the stored details.
          </p>
        ) : (
          <StoredDetails details={event.details} />
        )}
      </section>
    </div>
  )
}
