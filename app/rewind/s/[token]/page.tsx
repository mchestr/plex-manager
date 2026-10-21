import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { after } from "next/server"

import { OwnerBanner } from "@/components/rewind/share/owner-banner"
import { SharedRewind, shareMasthead } from "@/components/rewind/share/shared-rewind"
import { V2ShareArticle } from "@/components/rewind/share/v2-share-article"
import { RewindScope } from "@/components/rewind/stage/rewind-scope"
import { authOptions } from "@/lib/auth"
import { inkProps } from "@/lib/design/tokens"
import { getBaseUrl } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { ogPage } from "@/lib/rewind/cards/og"
import { rewindFontVariables } from "@/lib/rewind/fonts"
import { registry } from "@/lib/rewind/registry"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { clientIp } from "@/lib/security/client-ip"
import { getAppSettings } from "@/lib/settings/app-settings"
import { cn } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
import { getShareSafeRewind, type ShareSafeLookup } from "@/lib/wrapped/data/get-share-safe"
import { recordShareVisit } from "@/lib/wrapped/share/visit-counter"

export const dynamic = "force-dynamic"

const logger = createLogger("REWIND_SHARE_PAGE")

/** Share links are public but not meant for search results (also sent as `X-Robots-Tag` by next.config.js). */
const NO_INDEX = { index: false, follow: false }

type ShareParams = { params: Promise<{ token: string }> }

/** The page's title: the owner's name only when the link is signed. */
function shareTitle(found: ShareSafeLookup): string {
  if (found.kind === "v2") return `Rewind ${found.year}`
  return found.share.ownerName ? `${found.share.ownerName}’s Rewind ${found.year}` : shareMasthead(found.share)
}

/**
 * The title, `ogText` and the OG card of the first published page (design
 * 6.7) at `/api/rewind/card/s/{assetKey}/{page}?size=og`, whose URL carries
 * the asset key, never the token. A v2 link keeps the app's default OG image
 * (`app/opengraph-image.tsx`).
 */
export async function generateMetadata({ params }: ShareParams): Promise<Metadata> {
  const { token } = await params
  const found = await getShareSafeRewind(token)
  if (!found) return { title: "Rewind", robots: NO_INDEX }

  const title = shareTitle(found)
  if (found.kind === "v2") return { title, robots: NO_INDEX }

  const description = found.share.ogText
  const page = ogPage(found.share.pages.map((p) => p.type))
  const image = page ? `${getBaseUrl()}/api/rewind/card/s/${encodeURIComponent(found.assetKey)}/${page}?size=og` : null
  const images = image ? [{ url: image, width: 1200, height: 630, alt: description }] : []
  return {
    title,
    description,
    robots: NO_INDEX,
    openGraph: { title, description, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  }
}

/** "31 Jan 2027" in the server zone, or null for a link with no expiry. */
function publicUntil(expiresAt: Date | null, settings: { locale: string; timeZone: string }): string | null {
  if (!expiresAt) return null
  return new Intl.DateTimeFormat(settings.locale, { day: "numeric", month: "short", year: "numeric", timeZone: settings.timeZone }).format(expiresAt)
}

/** Counts the visit after the response: v3 once per visitor a day (no IP stored), v2 as P0.11 did. */
function recordVisit(found: ShareSafeLookup, ip: string) {
  after(async () => {
    try {
      if (found.kind === "v2") await prisma.wrappedShareVisit.create({ data: { wrappedId: found.wrappedId } })
      else if (isRedisConfigured()) await recordShareVisit(found.shareId, ip)
    } catch (error) {
      logger.error("Failed to record the share visit", error)
    }
  })
}

/**
 * The public share page (design 6.6). It sits outside the `(app)` guards, in
 * the Rewind scope on the first published page's field, so a signed-in friend
 * with unfinished onboarding or no subscription can open it too (RWV-05).
 *
 * proxy.ts answers before it renders: 429 over `rw:share-page`, 503 when the
 * database is down, and the 404 status for a token that shares nothing, with
 * this route's not-found page. The page body, not `generateMetadata`, counts
 * the visit, so each view counts once.
 */
export default async function SharedRewindPage({ params }: ShareParams) {
  const { token } = await params
  const found = await getShareSafeRewind(token)
  if (!found) notFound()

  const [session, requestHeaders, settings] = await Promise.all([getServerSession(authOptions), headers(), getAppSettings()])
  recordVisit(found, clientIp(requestHeaders))
  const viewerId = session?.user?.id ?? null
  const isOwner = viewerId === found.ownerUserId
  const until = publicUntil(found.kind === "v3" ? found.expiresAt : null, settings)

  if (found.kind === "v2") {
    const paper = inkProps("paper")
    return (
      <RewindScope fontClassName={rewindFontVariables}>
        <main id="main" tabIndex={-1} {...paper} className={cn(paper.className, "min-h-dvh bg-background px-4 py-8 text-foreground outline-none sm:px-8")}>
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
            {isOwner ? <OwnerBanner kind="v2" year={found.year} publicUntil={until} /> : null}
            <V2ShareArticle share={found.share} locale={settings.locale} />
          </div>
        </main>
      </RewindScope>
    )
  }

  const { share } = found
  const archetype = share.pages.find((page) => page.archetype)?.archetype?.id ?? null
  const first = share.pages[0]
  const ink = first ? pageInk(registry[first.type], archetype) : { ink: "paper" as const, opts: {} }
  const field = inkProps(ink.ink, ink.opts)

  return (
    <RewindScope fontClassName={rewindFontVariables} archetype={archetype}>
      <main
        id="main"
        tabIndex={-1}
        {...field}
        className={cn(field.className, "min-h-dvh bg-background px-4 py-8 text-foreground outline-none sm:px-8")}
        data-testid="rewind-share-page"
      >
        <SharedRewind
          share={share}
          assetKey={found.assetKey}
          signedIn={viewerId !== null}
          banner={isOwner ? <OwnerBanner kind="v3" shareId={found.shareId} year={found.year} publicUntil={until} /> : null}
        />
      </main>
    </RewindScope>
  )
}
