import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { PlaybackGuide } from "@/components/guides/playback-guide"
import { RequestsGuide } from "@/components/guides/requests-guide"
import { SupportGuide } from "@/components/guides/support-guide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions } from "@/lib/auth"
import { getHelpData } from "@/lib/member/help"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Help" }

function HelpSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20" data-testid={`help-${id}`}>
      <Card>
        <CardHeader>
          <CardTitle as="h2" id={`${id}-title`}>
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}

/**
 * Help (ui-design-system 6.1, UI-30): the onboarding guides for the member's
 * own service, at `#playback`, `#requests` and `#support`, which home links
 * to. Requests shows only with a public request URL.
 */
export default async function HelpPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")

  const help = await getHelpData(session.user.id)

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-140 flex-col gap-6">
        <h1 className="text-h1 text-foreground">Help</h1>

        <HelpSection id="playback" title="Get the best picture">
          <PlaybackGuide service={help.service} serverName={help.serverName} />
        </HelpSection>

        {help.requestsUrl && (
          <HelpSection id="requests" title="Request a title">
            <RequestsGuide requestsUrl={help.requestsUrl} />
          </HelpSection>
        )}

        <HelpSection id="support" title="Report a problem">
          <SupportGuide discord={help.discord} instructions={help.instructions} />
        </HelpSection>
      </div>
    </div>
  )
}
