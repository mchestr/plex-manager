"use client"

import { useState } from "react"

import { Alert } from "@/components/ui/alert"
import { useFormat } from "@/lib/format-context"
import type { AffiliatePanel, InvitesPageData } from "@/lib/member/invites"

import { JoinedList } from "./joined-list"
import { MakeInviteDialog } from "./make-invite-dialog"
import { OpenInvites } from "./open-invites"
import { StandingCard } from "./standing-card"

type Format = ReturnType<typeof useFormat>

/** "3 every 30 days, 1 free now, next back on 12 Nov". */
function allowanceLine({ allowance, free, nextBackAt }: AffiliatePanel, f: Format): string {
  const next = nextBackAt ? `, next back on ${f.date(nextBackAt, "day-month-short")}` : ""
  return `${allowance} every 30 days, ${free} free now${next}`
}

function Affiliate({ panel, inviterName, onHoursUnavailable }: { panel: AffiliatePanel; inviterName: string | null; onHoursUnavailable: () => void }) {
  const f = useFormat()
  const { capReached } = panel
  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="invites-open-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="invites-open-heading" className="text-h3 text-foreground">
              Open invites
            </h2>
            <p className="text-ui text-muted-foreground" data-testid="invites-allowance">
              {allowanceLine(panel, f)}
            </p>
          </div>
          <MakeInviteDialog inviterName={inviterName} disabled={panel.free === 0 || capReached !== null} onHoursUnavailable={onHoursUnavailable} />
        </div>
        {capReached && (
          <Alert tone="info" data-testid="invites-cap-reached">
            The server has no free invites now.
            {capReached.backAt && ` One comes back on ${f.date(capReached.backAt, "day-month-short")}.`}
          </Alert>
        )}
        <OpenInvites invites={panel.open} />
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="invites-joined-heading">
        <h2 id="invites-joined-heading" className="text-h3 text-foreground">
          People who joined
        </h2>
        <JoinedList joined={panel.joined} />
      </section>
    </>
  )
}

/** The Invites page body: the standing card, and for an affiliate their invites. */
export function InvitesView({ data }: { data: InvitesPageData }) {
  const [hoursUnavailable, setHoursUnavailable] = useState(false)
  const onHoursUnavailable = () => setHoursUnavailable(true)
  return (
    <>
      <StandingCard standing={data.standing} hoursUnavailable={hoursUnavailable} onHoursUnavailable={onHoursUnavailable} />
      {data.affiliate && <Affiliate panel={data.affiliate} inviterName={data.inviterName} onHoursUnavailable={onHoursUnavailable} />}
    </>
  )
}
