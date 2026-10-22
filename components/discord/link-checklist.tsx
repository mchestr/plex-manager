"use client"

import { useTransition } from "react"

import { disconnectDiscordAccount, resyncDiscordRole } from "@/actions/discord"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

interface DiscordConnectionSummary {
  username: string
  globalName?: string | null
  metadataSyncedAt?: string | Date | null
}

export interface DiscordLinkChecklistProps {
  /** The member's Plex sign-in name, or null for an account with no Plex link. */
  plexAccount: string | null
  connection: DiscordConnectionSummary | null
  isEnabled: boolean
  /** Whether the member is in the Discord server; null when it could not be checked. */
  isOnServer: boolean | null
  connectUrl: string
  serverName: string
  serverInviteCode: string | null
  instructions: string | null
}

type StepId = "plex" | "discord" | "role"

interface Step {
  id: StepId
  title: string
  detail: string
  done: boolean
}

function stepsFor({ plexAccount, connection, isOnServer }: DiscordLinkChecklistProps): Step[] {
  const roleDone = Boolean(connection?.metadataSyncedAt) && isOnServer !== false
  let roleDetail = "Given automatically once you link"
  if (roleDone) roleDetail = "You have the Member role"
  else if (connection && isOnServer === false) roleDetail = "Join the server to get it"
  else if (connection) roleDetail = "Not synced yet. Resync to try again."

  return [
    {
      id: "plex",
      title: "Plex account",
      detail: plexAccount ? `Signed in as ${plexAccount}` : "No Plex account on this sign-in",
      done: plexAccount !== null,
    },
    {
      id: "discord",
      title: "Discord account",
      detail: connection ? `Linked as ${connection.globalName || connection.username}` : "Not linked yet",
      done: connection !== null,
    },
    { id: "role", title: "Member role", detail: roleDetail, done: roleDone },
  ]
}

function StepMarker({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-caption tabular-nums",
        done ? "border-success bg-success-subtle text-success" : "border-border-strong text-muted-foreground"
      )}
    >
      {done ? <Icon icon={icons.done} className="size-3.5" /> : index + 1}
    </span>
  )
}

function JoinButton({ inviteCode, serverName, primary }: { inviteCode: string; serverName: string; primary: boolean }) {
  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      size={primary ? "lg" : "default"}
      className="w-full"
      nativeButton={false}
      render={<a href={`https://discord.gg/${inviteCode}`} target="_blank" rel="noopener noreferrer" />}
      data-testid="discord-link-join-server"
      data-primary={primary || undefined}
    >
      Join the {serverName} Discord
      <Icon icon={icons.externalLink} />
    </Button>
  )
}

/**
 * The Discord link checklist (ui-design-system 6.6, UI-01): Plex account,
 * Discord account and Member role, with one primary action for the next
 * missing item and Join as the secondary.
 */
export function DiscordLinkChecklist(props: DiscordLinkChecklistProps) {
  const { connection, isEnabled, isOnServer, connectUrl, serverName, serverInviteCode, instructions } = props
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const run = (action: typeof resyncDiscordRole, success: string) => {
    startTransition(async () => {
      const result = await action()
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      toast.showSuccess(success)
    })
  }

  if (!isEnabled) {
    return (
      <Card data-testid="discord-link-unavailable">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 text-foreground">Linking is not available yet</h2>
            <p className="text-ui text-muted-foreground">
              The server owner needs to finish setting up Discord before you can link your account.
            </p>
          </div>
          {serverInviteCode && <JoinButton inviteCode={serverInviteCode} serverName={serverName} primary={false} />}
        </CardContent>
      </Card>
    )
  }

  const steps = stepsFor(props)
  const next = steps.find((step) => !step.done && step.id !== "plex")
  const joinIsPrimary = next?.id === "role" && isOnServer === false && serverInviteCode !== null
  const resyncIsPrimary = next?.id === "role" && !joinIsPrimary

  return (
    <div className="flex flex-col gap-5" data-testid="discord-link-panel">
      <Card>
        <ol className="flex flex-col divide-y divide-border">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="flex items-start gap-3 px-5 py-4"
              data-testid={`discord-link-step-${step.id}`}
              data-done={step.done}
            >
              <StepMarker index={index} done={step.done} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-ui font-medium text-foreground">
                  {step.title}
                  <span className="sr-only">{step.done ? ", done" : ", to do"}</span>
                </span>
                <span className="truncate text-label text-muted-foreground">{step.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {instructions && (
        <p className="whitespace-pre-line text-ui text-muted-foreground" data-testid="discord-link-instructions">
          {instructions}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {next?.id === "discord" && (
          <Button
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<a href={connectUrl} />}
            icon={<Icon icon={icons.discord} />}
            data-testid="discord-link-connect"
            data-primary
          >
            Link Discord
          </Button>
        )}
        {connection && (
          <Button
            variant={resyncIsPrimary ? "primary" : "secondary"}
            size={resyncIsPrimary ? "lg" : "default"}
            className="w-full"
            onClick={() => run(resyncDiscordRole, "Member role synced")}
            loading={isPending}
            loadingLabel="Syncing"
            data-testid="discord-link-resync"
            data-primary={resyncIsPrimary || undefined}
          >
            Resync role
          </Button>
        )}
        {serverInviteCode && <JoinButton inviteCode={serverInviteCode} serverName={serverName} primary={joinIsPrimary} />}
        {connection && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => run(disconnectDiscordAccount, "Discord unlinked")}
            disabled={isPending}
            data-testid="discord-link-disconnect"
          >
            Unlink Discord
          </Button>
        )}
      </div>

      <p className="text-label text-muted-foreground" data-testid="discord-link-privacy">
        We keep your Discord ID and name to give you the member role. Unlink any time.
      </p>
    </div>
  )
}
