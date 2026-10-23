import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { PlaybackGuide } from "@/components/guides/playback-guide"
import { RequestsGuide } from "@/components/guides/requests-guide"
import { SupportGuide } from "@/components/guides/support-guide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions } from "@/lib/auth"
import { getAssistantDisclosure } from "@/lib/llm/assistant-disclosure"
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
 * to, and what admins can see at `#privacy` (P11.16), which links the
 * export on `/account` (P11.15). Requests shows only
 * with a public request URL.
 */
export default async function HelpPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")

  const [help, assistantDisclosure] = await Promise.all([getHelpData(session.user.id), getAssistantDisclosure()])

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

        <HelpSection id="privacy" title="Privacy">
          <div className="flex flex-col gap-3 text-ui text-muted-foreground">
            <p>Server admins can see your watch activity and your Rewind. Some Rewind text is written by an AI service.</p>
            <p data-testid="help-assistant-disclosure">{assistantDisclosure}</p>
            <p>
              Download a copy of your data, or delete marks, watchlist items and assistant conversations, in{" "}
              <Link href="/account#your-data" className="text-foreground underline underline-offset-3" data-testid="help-your-data-link">
                Your data
              </Link>
              .
            </p>
          </div>
        </HelpSection>
      </div>
    </div>
  )
}
