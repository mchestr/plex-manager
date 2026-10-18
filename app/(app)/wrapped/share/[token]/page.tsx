import { notFound } from "next/navigation"
import { Metadata } from "next"
import { WrappedShareSummary } from "@/components/wrapped/wrapped-share-summary"
import { getBaseUrl } from "@/lib/utils"
import { createLogger } from "@/lib/utils/logger"
import { ShareSafeRewindV2 } from "@/lib/wrapped/data/share-safe-v2"
import { stripHighlightTags } from "@/lib/wrapped/text-processor"

export const dynamic = 'force-dynamic'

const logger = createLogger("WRAPPED_SHARE_PAGE")

// Share links are public but not meant for search results.
const NO_INDEX = { index: false, follow: false }

async function getSharedWrapped(token: string): Promise<ShareSafeRewindV2 | null> {
  try {
    const baseUrl = getBaseUrl()
    const response = await fetch(`${baseUrl}/api/wrapped/share/${token}`, {
      cache: "no-store",
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(`Failed to fetch shared wrapped: ${response.statusText}`)
    }

    const body: { wrapped?: unknown } = await response.json()
    return ShareSafeRewindV2.parse(body.wrapped)
  } catch (error) {
    logger.error("Error fetching shared wrapped", error)
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const baseUrl = getBaseUrl()
  const shareUrl = `${baseUrl}/wrapped/share/${token}`

  // Try to fetch wrapped data for metadata
  const wrapped = await getSharedWrapped(token)

  if (!wrapped) {
    return {
      title: "Plex Wrapped - Share Not Found",
      description: "This wrapped share link is not available.",
      robots: NO_INDEX,
    }
  }

  const { ownerName, year } = wrapped
  const rawSummary = wrapped.summary || `Check out ${ownerName}'s ${year} Plex Wrapped!`
  // Strip highlight tags for social media sharing (they look ugly in previews)
  const summary = stripHighlightTags(rawSummary)
  const title = `${ownerName}'s ${year} Plex Wrapped`

  // Create a default OG image URL (you can replace this with a dynamic image generator later)
  const ogImageUrl = `${baseUrl}/api/wrapped/og-image?token=${token}`

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
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${ownerName}'s ${year} Plex Wrapped`,
        },
      ],
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

export default async function SharedWrappedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  if (!token) {
    notFound()
  }

  const sharedWrapped = await getSharedWrapped(token)

  if (!sharedWrapped) {
    notFound()
  }

  return <WrappedShareSummary rewind={sharedWrapped} shareToken={token} />
}
