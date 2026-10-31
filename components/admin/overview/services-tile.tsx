import type { Route } from "next"

import { StatusDot } from "@/components/ui/status-badge"
import { StatTile } from "@/components/ui/stat-tile"
import { settingsSection } from "@/lib/admin/routes"
import type { ServiceHealth, ServicesSummary } from "@/lib/admin/overview"
import { resolveStatus } from "@/lib/ui/status"
import type { BoundFormat } from "@/lib/utils/format"

import { Unavailable } from "./unavailable"

const TEST_ID = "admin-overview-services"

/** "Tautulli can't connect" for the worst service. @internal */
export function serviceProblem({ label, status }: ServiceHealth): string {
  if (status === "unreachable") return `${label} can't connect`
  if (status === "degraded") return `${label} uses template text`
  return `${label} needs setup`
}

/** Where the worst service is fixed: its settings section, or the queues page for Redis. @internal */
export function serviceHref(worst: ServiceHealth | null): Route {
  if (!worst || worst.id === "database") return "/admin/settings"
  if (worst.id === "redis") return "/admin/queues"
  return settingsSection(worst.id)
}

/** Services: "5 of 6 working", the worst one as meta, and a meter by category. */
export function ServicesTile({ services, f }: { services: ServicesSummary | null; f: BoundFormat }) {
  if (!services) {
    return <StatTile label="Services" value={null} meta={<Unavailable />} href="/admin/settings" data-testid={TEST_ID} />
  }

  const { working, attention, broken, total, worst } = services
  const meta = worst ? (
    <StatusDot tone={resolveStatus("connection", worst.status).tone} label={serviceProblem(worst)} />
  ) : (
    <StatusDot tone="success" label="All working" />
  )

  return (
    <StatTile
      label="Services"
      value={f.number(working)}
      unit={`of ${f.number(total)} working`}
      meta={meta}
      meter={[
        { value: working, tone: "success", label: `${f.number(working)} working` },
        { value: attention, tone: "warning", label: `${f.number(attention)} need attention` },
        { value: broken, tone: "destructive", label: `${f.number(broken)} not working` },
      ]}
      href={serviceHref(worst)}
      data-testid={TEST_ID}
    />
  )
}
