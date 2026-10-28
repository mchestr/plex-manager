import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PublicShell } from "@/components/shell/public-shell"
import { PlanList } from "@/components/subscribe/plan-list"
import { SubscribeSignOut } from "@/components/subscribe/subscribe-sign-out"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { StatusScreen } from "@/components/ui/status-screen"
import { getAccessLevel } from "@/lib/access"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { getOfferedPrices } from "@/lib/stripe/prices"
import { icons } from "@/lib/ui/icons"
import { getSession } from "@/lib/data/session"

export const metadata: Metadata = { title: "Join" }

/** An entitled member's way to billing: `/membership` holds Manage billing (P10.22). */
async function hasStripeCustomer(userId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  })
  return Boolean(subscription?.stripeCustomerId)
}

/** The owner's Discord invite code, for the unavailable screen's "Ask on Discord". */
async function discordInviteCode(): Promise<string | null> {
  const discord = await prisma.discordIntegration.findUnique({
    where: { id: "discord" },
    select: { serverInviteCode: true },
  })
  return discord?.serverInviteCode || null
}

function EntitledScreen({ billing }: { billing: boolean }) {
  const home = (
    <Button
      size="lg"
      variant={billing ? "secondary" : "primary"}
      nativeButton={false}
      render={<Link href="/" />}
      data-testid="subscribe-home-link"
    >
      Go to home
    </Button>
  )
  return (
    <div className="flex w-full justify-center" data-testid="subscribe-already-entitled">
      <StatusScreen
        icon={icons.success}
        title="You already have access"
        description="Your account is on the server. You do not need to subscribe."
        primaryAction={
          billing ? (
            <Button size="lg" nativeButton={false} render={<Link href="/membership" />} data-testid="subscribe-manage-billing">
              Manage billing
            </Button>
          ) : (
            home
          )
        }
        secondaryAction={billing ? home : undefined}
      />
    </div>
  )
}

function UnavailableScreen({ inviteCode }: { inviteCode: string | null }) {
  return (
    <div className="flex w-full justify-center" data-testid="subscribe-unavailable">
      <StatusScreen
        icon={icons.membership}
        title="Subscriptions aren't open right now"
        description={
          inviteCode
            ? "Ask the server owner on Discord when subscriptions open."
            : "Ask the server owner when subscriptions open."
        }
        primaryAction={
          inviteCode ? (
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={`https://discord.gg/${encodeURIComponent(inviteCode)}`} target="_blank" rel="noopener noreferrer" />}
              data-testid="subscribe-discord-link"
            >
              Ask on Discord
              <Icon icon={icons.externalLink} />
            </Button>
          ) : (
            <SubscribeSignOut variant="primary" />
          )
        }
        secondaryAction={inviteCode ? <SubscribeSignOut variant="secondary" /> : undefined}
      />
    </div>
  )
}

/**
 * Join (UI-37, UI-10): the plans a gated member can buy, inside PublicShell
 * with Sign out always present.
 *
 * It lives OUTSIDE the `(app)` group, so `ensureSubscriptionOrAccess()` never
 * redirects a gated member away from it. Anonymous visitors go to sign-in.
 *
 * - `full` access: "You already have access", with Manage billing (to
 *   `/membership`) when a Stripe customer exists. No plans, since a second
 *   checkout would bill twice (SEC-39).
 * - `lapsed`: the plans, with a note that finished Rewinds stay readable (FR-51).
 * - otherwise: "Join {serverName}" and the plans.
 * - no offered prices (Stripe off or unconfigured, FR-9): "Subscriptions aren't
 *   open right now", with the owner's Discord when an invite code exists.
 */
export default async function SubscribePage() {
  const session = await getSession()
  if (!session?.user?.id) {
    // NextAuth's configured sign-in page is "/" (see authOptions.pages.signIn).
    redirect("/")
  }
  const userId = session.user.id
  const memberName = session.user.name || session.user.email || "Member"

  const [plans, accessLevel, name] = await Promise.all([getOfferedPrices(), getAccessLevel(userId), serverName()])

  let content
  if (accessLevel === "full") {
    content = <EntitledScreen billing={await hasStripeCustomer(userId)} />
  } else if (plans.length === 0) {
    content = <UnavailableScreen inviteCode={await discordInviteCode()} />
  } else {
    content = (
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-h1 text-foreground">Join {name}</h1>
          <p className="text-body text-muted-foreground">
            {accessLevel === "lapsed"
              ? `You're signed in as ${memberName}, and your membership has ended.`
              : `You're signed in as ${memberName}, but you aren't on the server yet.`}
          </p>
        </div>
        {accessLevel === "lapsed" && (
          <Alert tone="info" data-testid="subscribe-lapsed-note">
            You can still read your finished Rewinds.
          </Alert>
        )}
        <PlanList plans={plans} />
      </div>
    )
  }

  return (
    <PublicShell serverName={name} width="wide" account={{ name: memberName }} data-testid="subscribe-page">
      {content}
    </PublicShell>
  )
}
