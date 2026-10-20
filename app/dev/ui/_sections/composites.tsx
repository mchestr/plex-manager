import { CloudOff, Download, SearchX, Ticket, UserPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { StatusDot } from "@/components/ui/status-badge"

import { Row, Specimen } from "./specimen"

export function PageHeaderSpecimen() {
  return (
    <Specimen id="page-header" title="PageHeader">
      <PageHeader
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Users", href: "/admin/users" }, { label: "Morgan Lee" }]}
        title="Morgan Lee"
        description="Member since March 2024. Watches mostly on the living room TV."
        meta={
          <>
            <Badge variant="outline">Admin</Badge>
            <StatusDot tone="success" label="Plex access" />
          </>
        }
        actions={
          <>
            <Button variant="outline" icon={<Download aria-hidden="true" />}>
              Export history
            </Button>
            <Button icon={<UserPlus aria-hidden="true" />}>Invite member</Button>
          </>
        }
        data-testid="dev-ui-page-header-detail"
      />
    </Specimen>
  )
}

export function StatTileSpecimen() {
  return (
    <Specimen id="stat-tile" title="StatTile and StatGrid">
      <StatGrid data-testid="dev-ui-stat-grid">
        <StatTile label="Members" value={7} unit="of 7 shared" href="/admin/users" />
        <StatTile
          label="Plex access"
          value={5}
          unit="allowed"
          meter={[
            { value: 5, tone: "success", label: "5 allowed" },
            { value: 2, tone: "warning", label: "2 not verified" },
          ]}
          meta={<StatusDot tone="warning" label="2 not verified" />}
        />
        <StatTile label="Plays this month" value="1,284" />
        <StatTile label="Watch time" value={null} meta="Tautulli didn't answer" />
      </StatGrid>
    </Specimen>
  )
}

export function EmptyStateSpecimen() {
  return (
    <Specimen id="empty-state" title="EmptyState">
      <Row label="First use">
        <EmptyState
          kind="first-use"
          icon={Ticket}
          title="No invites yet"
          description="Invites let new members join with the libraries you choose."
          primaryAction={<Button>Create invite</Button>}
        />
      </Row>
      <Row label="Filtered">
        <EmptyState
          kind="filtered"
          icon={SearchX}
          title="No users match these filters"
          description="Try a different role or Plex access filter."
          primaryAction={<Button variant="outline">Clear filters</Button>}
        />
      </Row>
      <Row label="Unavailable">
        <EmptyState
          kind="unavailable"
          icon={CloudOff}
          title="Tautulli isn't answering"
          description="Watch history comes back when Tautulli does."
          primaryAction={<Button variant="outline">Retry</Button>}
        />
      </Row>
    </Specimen>
  )
}
