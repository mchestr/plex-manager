"use client"

import { useQuery } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { getSubscriptionProvisioning, type SubscriptionProvisioning } from "@/actions/subscription"
import { Icon } from "@/components/ui/icon"
import { queryKeys } from "@/hooks/query-keys"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** Polled every 3 seconds for up to 2 minutes (UI-40). */
const POLL_MS = 3_000
const POLL_LIMIT_MS = 120_000

const isPaid = (data: SubscriptionProvisioning) => data.status === "ACTIVE" || data.status === "PAST_DUE"

/** The Plex step shows for a Plex member, and for a row that names no service yet. */
const showsPlex = (data: SubscriptionProvisioning) => data.services.length === 0 || data.services.includes("plex")
const showsJellyfin = (data: SubscriptionProvisioning) => data.services.includes("jellyfin")

/**
 * Payment confirmed, the Plex invite settled (accepted or waiting on the
 * member's email) and the Jellyfin account turned on, for each service shown.
 */
const isSettled = (data: SubscriptionProvisioning) =>
  isPaid(data) &&
  (!showsPlex(data) || data.plexInviteStatus === "accepted" || data.plexInviteStatus === "pending") &&
  (!showsJellyfin(data) || data.jellyfinAccessStatus === "enabled" || data.jellyfinAccessStatus === "skipped")

function sharingLabel(libraryCount: number | null): string {
  if (libraryCount === null) return "Sharing every library with your Plex account"
  return `Sharing ${libraryCount} ${libraryCount === 1 ? "library" : "libraries"} with your Plex account`
}

interface StepProps {
  icon: LucideIcon
  tone: "done" | "waiting" | "action"
  children: string
  "data-testid"?: string
}

function Step({ icon, tone, children, ...props }: StepProps) {
  return (
    <li className="flex items-start gap-3 text-ui text-foreground" data-state={tone} {...props}>
      <Icon
        icon={icon}
        className={cn("mt-0.5", tone === "done" ? "text-success" : tone === "action" ? "text-info" : "text-muted-foreground")}
      />
      {children}
    </li>
  )
}

/** The Plex line: the share, or the invite waiting in the member's email. */
function PlexStep({ data, paid }: { data: SubscriptionProvisioning; paid: boolean }) {
  if (paid && data.plexInviteStatus === "accepted") {
    return (
      <Step icon={icons.success} tone="done" data-testid="subscribe-success-accepted">
        {sharingLabel(data.libraryCount)}
      </Step>
    )
  }
  if (paid && data.plexInviteStatus === "pending") {
    return (
      <Step icon={icons.info} tone="action" data-testid="subscribe-success-pending">
        We sent a Plex invite to your email. Accept it to finish.
      </Step>
    )
  }
  return (
    <Step icon={icons.pending} tone="waiting" data-testid="subscribe-success-provisioning">
      {sharingLabel(data.libraryCount)}
    </Step>
  )
}

/** The Jellyfin line: the account turned on, or not found on the server. */
function JellyfinStep({ data, paid }: { data: SubscriptionProvisioning; paid: boolean }) {
  if (paid && data.jellyfinAccessStatus === "enabled") {
    return (
      <Step icon={icons.success} tone="done" data-testid="subscribe-success-jellyfin-enabled">
        Your Jellyfin account is enabled
      </Step>
    )
  }
  if (paid && data.jellyfinAccessStatus === "skipped") {
    return (
      <Step icon={icons.info} tone="action" data-testid="subscribe-success-jellyfin-skipped">
        We could not find your Jellyfin account. Ask the server owner to check it.
      </Step>
    )
  }
  return (
    <Step icon={icons.pending} tone="waiting" data-testid="subscribe-success-jellyfin-provisioning">
      Turning on your Jellyfin account
    </Step>
  )
}

/**
 * The success page's live checklist (UI-40): Payment confirmed, then one line
 * per service the member uses (P11.11): the Plex share or "We sent a Plex
 * invite to your email", and "Your Jellyfin account is enabled". Polled
 * through `getSubscriptionProvisioning` until all settle or 2 minutes pass.
 * Below it, the member-since and renewal dates once the subscription row has
 * them.
 */
export function ProvisioningChecklist({ initial }: { initial: SubscriptionProvisioning }) {
  const f = useFormat()
  const [timedOut, setTimedOut] = useState(false)

  // A real effect: the poll gives up after POLL_LIMIT_MS
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [])

  const { data } = useQuery({
    queryKey: queryKeys.subscriptionProvisioning(),
    queryFn: async () => {
      const result = await getSubscriptionProvisioning()
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    initialData: initial,
    // initialData counts as fresh; the first poll still waits a full interval.
    staleTime: POLL_MS,
    refetchInterval: (query) => (timedOut || (query.state.data && isSettled(query.state.data)) ? false : POLL_MS),
    retry: false,
  })

  const paid = isPaid(data)

  return (
    <div className="flex w-full flex-col gap-4" data-testid="subscribe-success-checklist">
      <ul className="flex flex-col gap-3">
        <Step icon={paid ? icons.success : icons.pending} tone={paid ? "done" : "waiting"} data-testid="subscribe-success-payment">
          {paid ? "Payment confirmed" : "Confirming your payment"}
        </Step>
        {showsPlex(data) && <PlexStep data={data} paid={paid} />}
        {showsJellyfin(data) && <JellyfinStep data={data} paid={paid} />}
      </ul>

      {timedOut && !isSettled(data) && (
        <p className="text-ui text-muted-foreground" data-testid="subscribe-success-slow">
          This is taking longer than usual. Check Home again in a few minutes.
        </p>
      )}

      {(data.memberSince || data.currentPeriodEnd) && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-ui" data-testid="subscribe-success-dates">
          {data.memberSince && (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-foreground">{f.date(data.memberSince, "month-year")}</dd>
            </div>
          )}
          {data.currentPeriodEnd && (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Renews</dt>
              <dd className="text-foreground">{f.date(data.currentPeriodEnd, "long")}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
