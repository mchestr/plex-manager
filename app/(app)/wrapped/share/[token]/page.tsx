import { notFound } from "next/navigation"
import { Metadata } from "next"
import { WrappedShareSummary } from "@/components/wrapped/wrapped-share-summary"
import { WrappedData } from "@/types/wrapped"
import { getBaseUrl } from "@/lib/utils"
import { stripHighlightTags } from "@/lib/wrapped/text-processor"

export const dynamic = 'force-dynamic'

async function getSharedWrapped(token: string) {
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

    const data = await response.json()
    return data.wrapped
  } catch (error) {
    console.error("Error fetching shared wrapped:", error)
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
    }
  }

  const userName = wrapped.userName || "Someone"
  const year = wrapped.year
  const rawSummary = wrapped.summary || `Check out ${userName}'s ${year} Plex Wrapped!`
  // Strip highlight tags for social media sharing (they look ugly in previews)
  const summary = stripHighlightTags(rawSummary)
  const title = `${userName}'s ${year} Plex Wrapped`

  // Create a default OG image URL (you can replace this with a dynamic image generator later)
  const ogImageUrl = `${baseUrl}/api/wrapped/og-image?token=${token}`

  return {
    title,
    description: summary,
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
          alt: `${userName}'s ${year} Plex Wrapped`,
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

  const wrappedData: WrappedData = sharedWrapped.data

  return (
    <WrappedShareSummary
      wrappedData={wrappedData}
      year={sharedWrapped.year}
      userName={sharedWrapped.userName}
      summary={sharedWrapped.summary}
    />
  )
}
