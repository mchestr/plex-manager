import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getSubscriptionProvisioning, type SubscriptionProvisioning } from "@/actions/subscription"
import { PublicShell } from "@/components/shell/public-shell"
import { ProvisioningChecklist } from "@/components/subscribe/provisioning-checklist"
import { Button } from "@/components/ui/button"
import { authOptions } from "@/lib/auth"
import { serverName } from "@/lib/brand"

export const metadata: Metadata = { title: "You're in" }

const NOTHING_YET: SubscriptionProvisioning = {
  status: null,
  plexInviteStatus: null,
  jellyfinAccessStatus: null,
  services: [],
  libraryCount: null,
  memberSince: null,
  currentPeriodEnd: null,
}

/**
 * You're in (UI-40): where Stripe Checkout returns (`success_url`). The access
 * grant runs later, in the webhook's job, so the page shows a live checklist
 * (Payment confirmed, then the Plex share or invite and the Jellyfin account,
 * per service) seeded from the server and polled on the client. Anonymous
 * visitors go to sign-in.
 */
export default async function SubscribeSuccessPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user
  if (!user?.id) redirect("/")

  const [provisioning, name] = await Promise.all([getSubscriptionProvisioning(), serverName()])

  return (
    <PublicShell
      serverName={name}
      width="wide"
      account={{ name: user.name || user.email || "Member" }}
      data-testid="subscribe-success-page"
    >
      <div className="flex w-full max-w-[440px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-foreground">You&apos;re in</h1>
          <p className="text-body text-muted-foreground">Thanks for joining {name}.</p>
        </div>
        <ProvisioningChecklist initial={provisioning.success ? provisioning.data : NOTHING_YET} />
        <Button nativeButton={false} render={<Link href="/" />} className="self-start" data-testid="subscribe-success-home-link">
          Go to home
        </Button>
      </div>
    </PublicShell>
  )
}
