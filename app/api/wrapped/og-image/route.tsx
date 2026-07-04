import { ImageResponse } from "next/og"
import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { shareRateLimiter } from "@/lib/security/rate-limit"
import { stripHighlightTags } from "@/lib/wrapped/text-processor"

// Force dynamic rendering since we use request.headers for rate limiting
export const dynamic = "force-dynamic"

const GOLD = "#d4af37"
const GOLD_BRIGHT = "#f5d67b"
const IVORY = "#ece5d8"
const TAUPE = "#9a9082"
const STAGE = "#0a0908"

interface CardStats {
  userName: string
  year: number
  archetype: string | null
  summary: string
  watchTimeText: string
  moviesWatched: number
  showsWatched: number
}

/**
 * GET /api/wrapped/og-image?token=[token]
 * GET /api/wrapped/og-image?token=[token]&format=card  (1080x1920 story card)
 *
 * Cinematic Premiere share images: gold on deep black, archetype billing.
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await shareRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    const format = searchParams.get("format")

    if (!token) {
      return new NextResponse(
        JSON.stringify(createSafeError(ErrorCode.VALIDATION_ERROR, "Token is required")),
        {
          status: getStatusCode(ErrorCode.VALIDATION_ERROR),
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // Find wrapped by share token
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { shareToken: token },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    // Security: Use same error message to prevent token enumeration
    if (!wrapped || wrapped.status !== "completed") {
      return new NextResponse("Wrapped not found", { status: 404 })
    }

    const wrappedData = JSON.parse(wrapped.data)
    const userName = wrapped.user.name || wrapped.user.email || "Someone"
    const rawSummary = wrapped.summary || `${userName}'s ${wrapped.year} in review`
    const stats = wrappedData.statistics || {}
    const totalWatchTime = stats.totalWatchTime?.total || 0
    const hours = Math.floor(totalWatchTime / 60)
    const days = Math.floor(hours / 24)

    const cardStats: CardStats = {
      userName,
      year: wrapped.year,
      archetype: wrapped.archetype,
      summary: stripHighlightTags(rawSummary),
      watchTimeText:
        days > 0 ? `${days} day${days !== 1 ? "s" : ""}` : `${hours} hour${hours !== 1 ? "s" : ""}`,
      moviesWatched: stats.moviesWatched || 0,
      showsWatched: stats.showsWatched || 0,
    }

    const image =
      format === "card"
        ? new ImageResponse(<StoryCard {...cardStats} />, { width: 1080, height: 1920 })
        : new ImageResponse(<OgCard {...cardStats} />, { width: 1200, height: 630 })

    image.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600")
    return image
  } catch (error) {
    logError("OG_IMAGE_API", error)
    return new NextResponse(
      JSON.stringify(createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to generate image")),
      {
        status: getStatusCode(ErrorCode.INTERNAL_ERROR),
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: 64, fontWeight: 700, color: GOLD_BRIGHT }}>{value}</span>
      <span style={{ fontSize: 22, color: TAUPE, textTransform: "uppercase", letterSpacing: 4 }}>
        {label}
      </span>
    </div>
  )
}

function OgCard(props: CardStats) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: STAGE,
        backgroundImage: `radial-gradient(ellipse 90% 70% at 50% 110%, rgba(212,175,55,0.18), transparent 60%)`,
        padding: "48px 80px",
        borderTop: `10px solid ${GOLD}`,
        borderBottom: `10px solid ${GOLD}`,
      }}
    >
      <span style={{ fontSize: 26, color: GOLD, textTransform: "uppercase", letterSpacing: 10 }}>
        Now Presenting
      </span>
      <span
        style={{
          fontSize: 68,
          fontWeight: 700,
          color: IVORY,
          textTransform: "uppercase",
          letterSpacing: 6,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        {props.userName}&apos;s {props.year} Wrapped
      </span>
      {props.archetype && (
        <span style={{ fontSize: 40, color: GOLD_BRIGHT, marginTop: 20, fontStyle: "italic" }}>
          {props.archetype}
        </span>
      )}
      <div style={{ display: "flex", gap: 110, marginTop: 56 }}>
        <Stat value={props.watchTimeText} label="watched" />
        <Stat value={String(props.moviesWatched)} label="films" />
        <Stat value={String(props.showsWatched)} label="series" />
      </div>
    </div>
  )
}

function StoryCard(props: CardStats) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: STAGE,
        backgroundImage: `radial-gradient(ellipse 100% 50% at 50% 115%, rgba(212,175,55,0.20), transparent 65%)`,
        padding: "120px 80px",
        borderTop: `16px solid ${GOLD}`,
        borderBottom: `16px solid ${GOLD}`,
      }}
    >
      <span style={{ fontSize: 34, color: GOLD, textTransform: "uppercase", letterSpacing: 14 }}>
        Now Presenting
      </span>
      <span
        style={{
          fontSize: 92,
          fontWeight: 700,
          color: IVORY,
          textTransform: "uppercase",
          letterSpacing: 6,
          marginTop: 32,
          textAlign: "center",
        }}
      >
        {props.userName}&apos;s {props.year}
      </span>
      {props.archetype && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 72,
            paddingTop: 48,
            paddingBottom: 48,
            borderTop: `2px solid rgba(212,175,55,0.4)`,
            borderBottom: `2px solid rgba(212,175,55,0.4)`,
            width: "100%",
          }}
        >
          <span style={{ fontSize: 28, color: TAUPE, textTransform: "uppercase", letterSpacing: 8 }}>
            And the award goes to
          </span>
          <span
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: GOLD_BRIGHT,
              marginTop: 24,
              textAlign: "center",
            }}
          >
            {props.archetype}
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 56, marginTop: 88 }}>
        <Stat value={props.watchTimeText} label="watched" />
        <Stat value={String(props.moviesWatched)} label="films" />
        <Stat value={String(props.showsWatched)} label="series" />
      </div>
      <span
        style={{
          fontSize: 30,
          color: TAUPE,
          marginTop: 96,
          textTransform: "uppercase",
          letterSpacing: 6,
        }}
      >
        A Plex Wrapped Production
      </span>
    </div>
  )
}
