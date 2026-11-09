import type { Metadata } from "next"

import { UnsubscribeDeadLink, UnsubscribeForm } from "@/components/email/unsubscribe-form"
import { serverName as getServerName } from "@/lib/brand"
import { verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"

/** The URL holds the member's token: out of search results, and never in a Referer (also sent by next.config.js). */
export const metadata: Metadata = {
  title: "Stop emails",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

interface UnsubscribePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The unsubscribe page that the link in an email opens. It checks the token
 * and changes nothing on load, so a link scanner or a preview bot cannot
 * unsubscribe anyone: the member presses "Stop these emails", which works
 * without JavaScript too (`UnsubscribeForm`). It never shows an address or
 * a name.
 *
 * A changed, expired or old token (a new `NEXTAUTH_SECRET`) shows the
 * dead-link screen. The page reads no database row: the signature already
 * shows that this app made the link. The button finds a removed member and
 * shows the same screen then.
 */
export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { token } = await searchParams
  const raw = typeof token === "string" ? token : null
  const name = await getServerName()

  if (!raw || !verifyUnsubscribeToken(raw)) return <UnsubscribeDeadLink serverName={name} />

  return <UnsubscribeForm token={raw} serverName={name} />
}
