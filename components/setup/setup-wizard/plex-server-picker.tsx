"use client"

import { Badge } from "@/components/ui/badge"
import { FormField } from "@/components/ui/form-field"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFormat } from "@/lib/format-context"
import type { PickerServer, PlexServerConnection } from "@/types/setup"

/** A server the owner can choose: owned and online. */
export const isChoosable = (server: PickerServer) => server.owned && server.online

function connectionLabel(connection: PlexServerConnection): string {
  const where = connection.relay ? "Relay, slowest" : connection.local ? "Local, fastest" : "Remote"
  return `${connection.uri}, ${where}`
}

interface PlexServerPickerProps {
  servers: PickerServer[]
  selected: string | null
  onSelect: (machineIdentifier: string) => void
  uri: string | null
  onUriChange: (uri: string) => void
  uriError?: string
  disabled?: boolean
}

/**
 * The servers on the owner's plex.tv account as radio cards (design 6.5):
 * owned servers that are online can be chosen; an offline one says since
 * when, and a shared one says only its owner can set it up. Under it, "Address
 * Plex Manager uses" lists the chosen server's addresses, local first.
 */
export function PlexServerPicker({ servers, selected, onSelect, uri, onUriChange, uriError, disabled }: PlexServerPickerProps) {
  const f = useFormat()
  const chosen = servers.find((server) => server.machineIdentifier === selected) ?? null
  const items = (chosen?.connections ?? []).map((connection) => ({ value: connection.uri, label: connectionLabel(connection) }))

  const detail = (server: PickerServer) => {
    if (!server.owned) return "Shared with you. Only its owner can set it up."
    if (!server.online) return server.lastSeenAt ? `Not reachable since ${f.date(server.lastSeenAt)}. Start the server to choose it.` : "Not reachable. Start the server to choose it."
    return [server.version && `Plex Media Server ${server.version}`, server.platform && `on ${server.platform}`].filter(Boolean).join(" ") || "Plex Media Server"
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p id="setup-plex-servers-label" className="text-label font-medium text-foreground">
          Choose your server
        </p>
        {servers.length === 0 ? (
          <p className="text-ui text-muted-foreground" data-testid="setup-plex-no-servers">
            This Plex account has no servers. Sign in with the account that owns yours, or enter a token instead.
          </p>
        ) : (
          <RadioGroup value={selected} onValueChange={onSelect} aria-labelledby="setup-plex-servers-label" disabled={disabled} data-testid="setup-plex-servers">
            {servers.map((server) => (
              <RadioCard
                key={server.machineIdentifier}
                value={server.machineIdentifier}
                disabled={!isChoosable(server)}
                data-testid={`setup-plex-server-${server.machineIdentifier}`}
                trailing={
                  !server.owned ? (
                    <Badge variant="outline">Shared</Badge>
                  ) : server.online ? (
                    <Badge variant="success" dot>
                      Online
                    </Badge>
                  ) : (
                    <Badge>Offline</Badge>
                  )
                }
              >
                <span className="text-ui font-medium text-foreground">{server.name}</span>
                <span className="text-label text-muted-foreground">{detail(server)}</span>
              </RadioCard>
            ))}
          </RadioGroup>
        )}
      </div>
      {chosen && (
        <FormField name="setup-plex-address" label="Address Plex Manager uses" description="From the server's addresses on plex.tv. Members never see it." error={uriError}>
          <Select items={items} value={uri} onValueChange={(next) => next !== null && onUriChange(next)} disabled={disabled}>
            <SelectTrigger data-testid="setup-plex-address">
              <SelectValue className="font-mono" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
    </div>
  )
}
