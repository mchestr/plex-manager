import type { Metadata } from "next"
import Link from "next/link"

import { InvitePass } from "@/components/invite/invite-pass"
import { notFoundInviteCode } from "@/components/status/not-found-screen"
import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { getInvitePass } from "@/lib/invites/pass"
import { icons } from "@/lib/ui/icons"

interface InvitePageProps {
  params: Promise<{ code: string }>
}

const UNAVAILABLE = "Invite unavailable"

/**
 * The unfurl (UI-36): "You're invited to {server}" for a valid invite, else
 * "Invite unavailable". No code in the metadata, and never indexed. The image
 * is the default OG card.
 */
export async function generateMetadata({ params }: InvitePageProps): Promise<Metadata> {
  const lookup = await getInvitePass((await params).code)
  const valid = lookup.ok && lookup.pass.state === "valid"
  const title = valid ? `You're invited to ${lookup.pass.serverName}` : UNAVAILABLE
  const description = valid
    ? `Accept the invite to join ${lookup.pass.serverName}.`
    : "This invite link can't be used. Ask the person who sent it for a new one."

  // Setting openGraph here replaces the inherited one, so the default card is named again.
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/twitter-image"] },
  }
}

/**
 * `/invite/[code]`, rendered on the server (ui-design-system 6.6): the
 * InvitePass in its state, or "Too many attempts" when the lookup limit is spent.
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params
  const lookup = await getInvitePass(code)

  if (!lookup.ok) {
    return (
      <StatusScreen
        icon={icons.warning}
        code={lookup.code}
        title="Too many attempts"
        description="This address has opened too many invite links. Wait a few minutes, then open the link again."
        titleTestId="invite-rate-limited-heading"
        primaryAction={
          <Button size="lg" nativeButton={false} render={<Link href={`/invite/${encodeURIComponent(code)}`} />} data-testid="invite-retry">
            Try again
          </Button>
        }
      />
    )
  }

  const discordInviteCode = lookup.pass.state === "valid" ? null : await notFoundInviteCode()

  return <InvitePass {...lookup.pass} discordInviteCode={discordInviteCode} />
}
