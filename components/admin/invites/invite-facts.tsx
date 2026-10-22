import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BoundFormat } from "@/lib/utils/format"

interface InviteFactsProps {
  invite: {
    serverType: "PLEX" | "JELLYFIN"
    useCount: number
    maxUses: number
    expiresAt: Date | null
    createdAt: Date
    allowDownloads: boolean
  }
  /** The pass's library names, or "All libraries". */
  libraries: string[]
  f: BoundFormat
}

/** An invite's settings on its detail page (P10.1), as a definition list. */
export function InviteFacts({ invite, libraries, f }: InviteFactsProps) {
  const plex = invite.serverType === "PLEX"
  const facts: [string, string][] = [
    ["Server", plex ? "Plex" : "Jellyfin"],
    ["Uses", `${f.number(invite.useCount)} of ${f.number(invite.maxUses)}`],
    ["Expires", invite.expiresAt ? f.dateTime(invite.expiresAt, { zoneLabel: true }) : "Never"],
    ["Created", f.dateTime(invite.createdAt, { zoneLabel: true })],
    ["Libraries", libraries.join(", ")],
    ...(plex ? [["Downloads", invite.allowDownloads ? "Allowed" : "Not allowed"] as [string, string]] : []),
  ]

  return (
    <Card data-testid="admin-invite-facts">
      <CardHeader>
        <CardTitle as="h2">Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {facts.map(([term, value]) => (
            <div key={term} className="flex flex-col gap-1">
              <dt className="text-label text-muted-foreground">{term}</dt>
              <dd className="text-ui text-foreground tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
