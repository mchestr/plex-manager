import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { after } from "next/server"

import { WrappedShareSummary } from "@/components/wrapped/wrapped-share-summary"
import { prisma } from "@/lib/prisma"
import { getBaseUrl } from "@/lib/env"
import { createLogger } from "@/lib/utils/logger"
import { getShareSafeRewind } from "@/lib/wrapped/data/get-share-safe"
import { isShareBusy } from "@/lib/wrapped/share-page-limit"
import { stripHighlightTags } from "@/lib/wrapped/text-processor"

export const dynamic = "force-dynamic"

const logger = createLogger("WRAPPED_SHARE_PAGE")

// Share links are public but not meant for search results.
const NO_INDEX = { index: false, follow: false }

type ShareParams = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: ShareParams): Promise<Metadata> {
  if (await isShareBusy()) {
    return { title: "Plex Wrapped", robots: NO_INDEX }
  }

  const { token } = await params
  const found = await getShareSafeRewind(token)

  if (!found) {
    return {
      title: "Plex Wrapped",
      description: "This share link is not available.",
      robots: NO_INDEX,
    }
  }

  const { ownerName, year } = found.share
  const baseUrl = getBaseUrl()
  const shareUrl = `${baseUrl}/wrapped/share/${token}`
  const ogImageUrl = `${baseUrl}/api/wrapped/og-image?token=${token}`
  const title = `${ownerName}'s ${year} Plex Wrapped`
  // Highlight tags look broken in link previews.
  const summary = stripHighlightTags(found.share.summary || `Check out ${ownerName}'s ${year} Plex Wrapped!`)

  return {
    title,
    description: summary,
    robots: NO_INDEX,
    openGraph: {
      title,
      description: summary,
      url: shareUrl,
      siteName: "Plex Wrapped",
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: summary,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: shareUrl,
    },
  }
}

function ShareBusy() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <p data-testid="wrapped-share-busy" role="status" className="text-center text-lg text-slate-300">
        This page is busy. Try again in a minute.
      </p>
    </div>
  )
}

/**
 * The public share page. It sits outside the `(app)` guards, so a signed-in
 * friend with unfinished onboarding or no subscription can open it too
 * (RWV-05).
 *
 * proxy.ts spends the visitor's own `rw:share-page` point before any database
 * read and marks a visitor over the limit busy (lib/wrapped/share-page-limit.ts).
 * The page body, not `generateMetadata`, records the visit, so each view
 * counts once.
 */
export default async function SharedWrappedPage({ params }: ShareParams) {
  const { token } = await params

  if (await isShareBusy()) {
    return (
      <main id="main" tabIndex={-1} className="min-h-screen outline-none">
        <ShareBusy />
      </main>
    )
  }

  const found = await getShareSafeRewind(token)
  if (!found) {
    notFound()
  }

  const { wrappedId } = found
  after(async () => {
    try {
      await prisma.wrappedShareVisit.create({ data: { wrappedId } })
    } catch (error) {
      logger.error("Failed to record the share visit", error)
    }
  })

  return (
    <main id="main" tabIndex={-1} className="min-h-screen outline-none">
      <WrappedShareSummary rewind={found.share} shareToken={token} />
    </main>
  )
}
