import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { shareRateLimiter } from "@/lib/security/rate-limit"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"

// Force dynamic rendering since we use request.headers for rate limiting
export const dynamic = 'force-dynamic'

/**
 * GET /api/wrapped/og-image?token=[token]
 * Generate an Open Graph image for social media sharing
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

    if (!token) {
      return new NextResponse(
        JSON.stringify(createSafeError(ErrorCode.VALIDATION_ERROR, "Token is required")),
        {
          status: getStatusCode(ErrorCode.VALIDATION_ERROR),
          headers: { "Content-Type": "application/json" }
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
    const year = wrapped.year
    const summary = wrapped.summary || `Check out ${userName}'s ${year} Plex Wrapped!`

    // Extract some key stats for the image
    const stats = wrappedData.statistics || {}
    const totalWatchTime = stats.totalWatchTime?.total || 0
    const moviesWatched = stats.moviesWatched || 0
    const showsWatched = stats.showsWatched || 0

    // Format watch time
    const hours = Math.floor(totalWatchTime / 60)
    const days = Math.floor(hours / 24)
    const watchTimeText = days > 0 ? `${days} day${days !== 1 ? "s" : ""}` : `${hours} hour${hours !== 1 ? "s" : ""}`

    // Generate SVG image (1200x630 for optimal OG image size)
    const titleText = `${userName}'s ${year} Plex Wrapped`
    const summaryText = summary.length > 120 ? summary.substring(0, 120) + "..." : summary

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0891b2;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#9333ea;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGradient)"/>

  <!-- Content Container -->
  <g transform="translate(60, 60)">
    <!-- Title -->
    <text x="0" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="bold" fill="white">
      ${escapeXml(titleText)}
    </text>

    <!-- Summary -->
    <text x="0" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="32" fill="rgba(255,255,255,0.9)" font-weight="300">
      ${escapeXml(summaryText)}
    </text>

    <!-- Stats Container -->
    <g transform="translate(0, 280)">
      <!-- Total Watch Time -->
      <rect x="0" y="0" width="340" height="200" rx="16" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
      <text x="170" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">
        ${escapeXml(watchTimeText)}
      </text>
      <text x="170" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)" text-anchor="middle">
        Total Watch Time
      </text>

      <!-- Movies -->
      <rect x="380" y="0" width="340" height="200" rx="16" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
      <text x="550" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">
        ${escapeXml(moviesWatched.toString())}
      </text>
      <text x="550" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)" text-anchor="middle">
        Movies Watched
      </text>

      <!-- Shows -->
      <rect x="760" y="0" width="340" height="200" rx="16" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
      <text x="930" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">
        ${escapeXml(showsWatched.toString())}
      </text>
      <text x="930" y="100" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)" text-anchor="middle">
        Shows Watched
      </text>
    </g>

    <!-- Footer -->
    <text x="0" y="560" font-family="system-ui, -apple-system, sans-serif" font-size="24" fill="rgba(255,255,255,0.7)">
      plex-wrapped.com
    </text>
  </g>
</svg>`

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (error) {
    logError("OG_IMAGE_API", error)
    return new NextResponse(
      JSON.stringify(createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to generate image")),
      {
        status: getStatusCode(ErrorCode.INTERNAL_ERROR),
        headers: { "Content-Type": "application/json" }
      }
    )
  }
}

/**
 * Escape XML special characters to prevent injection
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

