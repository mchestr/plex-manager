"use client"

import { Alert } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Standing } from "@/lib/affiliates/standing"
import { useFormat } from "@/lib/format-context"

import { ApplyForm } from "./apply-form"

interface StandingCardProps {
  standing: Standing
  /** A live watch-time check (Apply or Make) failed: Tautulli did not answer. */
  hoursUnavailable: boolean
  onHoursUnavailable: () => void
}

type Format = ReturnType<typeof useFormat>

function copyFor(standing: Standing, f: Format): { title: string; description: string } {
  const hours = (value: number) => `${f.number(Math.floor(value))} h`
  switch (standing.state) {
    case "below_bar":
      return { title: "Apply to send invites", description: `You have ${hours(standing.hours)}; you can apply at ${hours(standing.barHours)}.` }
    case "can_apply":
      return { title: "Apply to send invites", description: "An admin reads each application. You can add a note for them." }
    case "pending":
      return { title: "Application sent", description: `You applied on ${f.date(standing.appliedAt, "long")}. An admin will decide soon.` }
    case "approved":
      return { title: "You can send invites", description: "Each invite is for one person and works for 48 hours." }
    case "paused":
      return { title: "Invites paused", description: "You can make invites again when your subscription ends." }
    case "paid":
      return { title: "Apply to send invites", description: "Members with a paid subscription can't apply." }
    case "refused":
    case "revoked":
      return {
        title: standing.state === "refused" ? "Application refused" : "Your invites were stopped",
        description: `You can apply again on ${f.date(standing.applyAgainAt, "long")}.`,
      }
  }
}

/** The member's standing (`data-state`), with the apply form when they can apply. */
export function StandingCard({ standing, hoursUnavailable, onHoursUnavailable }: StandingCardProps) {
  const f = useFormat()
  const { title, description } = copyFor(standing, f)
  const reason = standing.state === "refused" || standing.state === "revoked" ? standing.reason : null
  const canApply = standing.state === "can_apply"
  return (
    <Card data-testid="invites-standing" data-state={standing.state}>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {(reason || hoursUnavailable || canApply) && (
        <CardContent className="flex flex-col gap-4">
          {reason && (
            <p className="text-ui text-foreground" data-testid="invites-standing-reason">
              Reason: {reason}
            </p>
          )}
          {hoursUnavailable && (
            <Alert tone="warning" data-testid="invites-hours-unavailable">
              We can&apos;t check your watch time now. Try again later.
            </Alert>
          )}
          {canApply && <ApplyForm onHoursUnavailable={onHoursUnavailable} />}
        </CardContent>
      )}
    </Card>
  )
}
