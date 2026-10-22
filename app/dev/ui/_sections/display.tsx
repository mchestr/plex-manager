import { CircleCheck, Clock, Film, Lock, Server, Settings, TriangleAlert, Tv } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { StatusBadge, StatusDot } from "@/components/ui/status-badge"
import type { Tone } from "@/lib/ui/status"

import { Row, Specimen } from "./specimen"

const BADGE_VARIANTS = ["neutral", "outline", "success", "warning", "info", "destructive"] as const
const TONES: { tone: Tone; label: string }[] = [
  { tone: "success", label: "Active" },
  { tone: "warning", label: "Past due" },
  { tone: "info", label: "Pending" },
  { tone: "destructive", label: "Failed" },
  { tone: "neutral", label: "Paused" },
  { tone: "outline", label: "Admin" },
  { tone: "plain", label: "Member" },
]

export function CardSpecimen() {
  return (
    <Specimen id="card" title="Card">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plex server</CardTitle>
            <CardDescription>Where members watch and sign in.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-sm" aria-label="Plex server settings">
                <Icon icon={Settings} />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <StatusDot tone="success" label="Online" />
          </CardContent>
          <CardFooter>
            <p className="flex-1 text-label text-muted-foreground">Checked 4 minutes ago</p>
            <Button variant="secondary" size="sm">
              Test connection
            </Button>
          </CardFooter>
        </Card>
      </div>
    </Specimen>
  )
}

export function BadgeSpecimen() {
  return (
    <Specimen id="badge" title="Badge">
      <Row label="Variants">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </Row>
      <Row label="With a dot">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant} dot>
            {variant}
          </Badge>
        ))}
      </Row>
      <Row label="With an icon">
        <Badge variant="success" icon={CircleCheck}>
          Connected
        </Badge>
        <Badge variant="warning" icon={TriangleAlert}>
          Retires soon
        </Badge>
        <Badge variant="neutral" icon={Lock}>
          Saved
        </Badge>
      </Row>
    </Specimen>
  )
}

export function StatusSpecimen() {
  return (
    <Specimen id="status-badge" title="StatusBadge and StatusDot">
      <Row label="StatusBadge">
        {TONES.map(({ tone, label }) => (
          <StatusBadge key={tone} tone={tone} label={label} />
        ))}
      </Row>
      <Row label="With sub and icon">
        <StatusBadge tone="success" label="Active" sub="Renews Nov 2" icon={CircleCheck} />
        <StatusBadge tone="warning" label="Past due" sub="Retrying Oct 21" />
      </Row>
      <Row label="StatusDot">
        {TONES.map(({ tone, label }) => (
          <StatusDot key={tone} tone={tone} label={label} />
        ))}
      </Row>
    </Specimen>
  )
}

export function IconSpecimen() {
  return (
    <Specimen id="icon" title="Icon">
      <Row label="12, 14, 16, 20">
        {([12, 14, 16, 20] as const).map((size) => (
          <span key={size} className="inline-flex items-center gap-2 text-muted-foreground">
            <Icon icon={Tv} size={size} />
            <Icon icon={Film} size={size} />
            <Icon icon={Server} size={size} />
            <Icon icon={Clock} size={size} />
          </span>
        ))}
      </Row>
      <Row label="Labelled">
        <Icon icon={CircleCheck} label="Connected" className="text-success" />
      </Row>
    </Specimen>
  )
}
