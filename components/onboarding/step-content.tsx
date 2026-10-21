import type { ReactNode, Ref } from "react"

import { PlaybackGuide } from "@/components/guides/playback-guide"
import { PlaybackIllustration } from "@/components/guides/playback-illustration"
import { RequestsGuide } from "@/components/guides/requests-guide"
import { RequestsIllustration } from "@/components/guides/requests-illustration"
import { SupportGuide } from "@/components/guides/support-guide"
import { Alert } from "@/components/ui/alert"
import { Icon } from "@/components/ui/icon"
import type { OnboardingData } from "@/lib/member/onboarding"
import { icons } from "@/lib/ui/icons"
import type { OnboardingStepId } from "@/types/onboarding"

/** Linking returns to onboarding, which P4.9's redirect allow-list permits (UI-01). */
const ONBOARDING_DISCORD_CONNECT = `/discord/connect?redirect=${encodeURIComponent("/onboarding")}`

interface StepContentProps {
  stepId: OnboardingStepId
  data: OnboardingData
  /** The wizard focuses this h1 when the step changes (UI-10). */
  headingRef: Ref<HTMLHeadingElement>
}

function StepHeading({ stepId, headingRef, children }: { stepId: OnboardingStepId; headingRef: Ref<HTMLHeadingElement>; children: ReactNode }) {
  return (
    <h1
      ref={headingRef}
      id="onboarding-step-title"
      tabIndex={-1}
      className="text-h2 text-foreground outline-none"
      data-testid={`onboarding-${stepId}-heading`}
    >
      {children}
    </h1>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-body text-muted-foreground">{children}</p>
}

function TopicList({ items }: { items: Array<{ icon: (typeof icons)[keyof typeof icons]; title: string; text: string }> }) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.title} className="flex items-start gap-3 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
            <Icon icon={item.icon} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-ui font-medium text-foreground">{item.title}</span>
            <span className="text-ui text-muted-foreground">{item.text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "What's next": only what this server has switched on (UI-34). */
function whatsNext(data: OnboardingData): Array<{ icon: (typeof icons)[keyof typeof icons]; title: string; text: string }> {
  const items = []
  if (data.rewind) items.push({ icon: icons.rewind, title: "Rewind", text: "Your year on the server, when the season opens." })
  if (data.requestsUrl) items.push({ icon: icons.requests, title: "Requests", text: "Ask for a missing title from the request site." })
  if (data.discord?.linkEnabled) {
    items.push({
      icon: icons.discord,
      title: "Discord",
      text: data.discord.handle ? `Linked as ${data.discord.handle}.` : "Link your account any time at /discord/link.",
    })
  }
  return items
}

/**
 * One onboarding step's body (ui-design-system 6.5): an illustration from
 * real UI pieces where the step has one, the h1, a lead and the shared guide
 * from `components/guides/*`. Service names come from `data` (UI-34).
 */
export function StepContent({ stepId, data, headingRef }: StepContentProps) {
  switch (stepId) {
    case "welcome":
      return (
        <>
          <StepHeading stepId={stepId} headingRef={headingRef}>
            Welcome to {data.serverName}
          </StepHeading>
          <Lead>A few tips before you start watching. It takes about a minute.</Lead>
          <TopicList
            items={[
              { icon: icons.plex, title: "Playback", text: "Get the best picture on every device." },
              ...(data.requestsUrl
                ? [{ icon: icons.requests, title: "Requests", text: "Ask for movies and shows that are missing." }]
                : []),
              { icon: icons.info, title: "Support", text: "Where to go when something goes wrong." },
            ]}
          />
        </>
      )
    case "playback":
      return (
        <>
          <PlaybackIllustration service={data.service} />
          <StepHeading stepId={stepId} headingRef={headingRef}>
            Get the best picture
          </StepHeading>
          <PlaybackGuide service={data.service} serverName={data.serverName} />
          <Alert tone="info" role="note" title="Each device has its own setting.">
            Repeat this on every TV, phone and browser you watch on.
          </Alert>
        </>
      )
    case "requests":
      return (
        <>
          <RequestsIllustration />
          <StepHeading stepId={stepId} headingRef={headingRef}>
            Ask for something new
          </StepHeading>
          {data.requestsUrl && <RequestsGuide requestsUrl={data.requestsUrl} />}
        </>
      )
    case "support":
      return (
        <>
          <StepHeading stepId={stepId} headingRef={headingRef}>
            Get help when you need it
          </StepHeading>
          <SupportGuide discord={data.discord} linkHref={ONBOARDING_DISCORD_CONNECT} instructions={data.instructions} />
        </>
      )
    case "final": {
      const next = whatsNext(data)
      return (
        <>
          <StepHeading stepId={stepId} headingRef={headingRef}>
            You are ready to watch
          </StepHeading>
          <Lead>Finish to open your home page on {data.serverName}.</Lead>
          {next.length > 0 && (
            <section aria-labelledby="onboarding-whats-next" className="flex flex-col gap-2">
              <h2 id="onboarding-whats-next" className="text-h3 text-foreground">
                What&apos;s next
              </h2>
              <TopicList items={next} />
            </section>
          )}
          <p className="text-ui text-muted-foreground" data-testid="onboarding-help-note">
            You can find this guide again under Help.
          </p>
        </>
      )
    }
  }
}
