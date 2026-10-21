import { Card } from "@/components/ui/card"
import { StatusBadge, StatusDot } from "@/components/ui/status-badge"
import type { ResolvedStatus } from "@/lib/ui/status"

interface DiscordStatusRowsProps {
  linkedRoles: ResolvedStatus
  supportBot: ResolvedStatus
}

function StatusWord({ status, testId }: { status: ResolvedStatus; testId: string }) {
  // A warning carries its icon (5.6); every other state is a dot and a word.
  if (status.mark && typeof status.mark !== "string") {
    return <StatusBadge tone={status.tone} label={status.label} icon={status.mark} data-testid={testId} />
  }
  return <StatusDot tone={status.tone} label={status.label} data-testid={testId} />
}

/**
 * "Linked roles" and "Support bot" (P10.5, UI-08), each read on its own from
 * `discordStatus`, so a stopped bot never reads as the whole feature being off.
 */
export function DiscordStatusRows({ linkedRoles, supportBot }: DiscordStatusRowsProps) {
  const rows = [
    { id: "linked-roles", name: "Linked roles", status: linkedRoles },
    { id: "support-bot", name: "Support bot", status: supportBot },
  ]
  return (
    <Card>
      <dl className="divide-y" data-testid="discord-status">
        {rows.map(({ id, name, status }) => (
          <div
            key={id}
            className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            data-testid={`discord-status-${id}`}
          >
            <dt className="text-ui font-medium text-foreground">{name}</dt>
            <dd className="flex flex-col gap-0.5 sm:items-end">
              <StatusWord status={status} testId={`discord-status-${id}-word`} />
              {status.sub && (
                <span className="text-caption text-muted-foreground" data-testid={`discord-status-${id}-sub`}>
                  {status.sub}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
