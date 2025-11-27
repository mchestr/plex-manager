import { completeDiscordLink } from "@/lib/discord/integration"
import { getBaseUrl } from "@/lib/utils"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  let redirectPath = "/"
  let status: string | null = null
  let errorMessage: string | null = null

  if (errorParam) {
    // Format error message with description if available
    if (errorDescription) {
      errorMessage = `${errorParam}: ${errorDescription}`
    } else {
      errorMessage = errorParam
    }
  } else if (!code || !state) {
    errorMessage = "Missing authorization data"
  } else {
    try {
      const { redirectTo } = await completeDiscordLink(code, state)
      redirectPath = redirectTo || "/"
      status = "linked"
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to complete Discord linking"
    }
  }

  const searchParams = new URLSearchParams()
  if (status) {
    searchParams.set("status", status)
  }
  if (errorMessage) {
    searchParams.set("error", errorMessage)
    // Also pass error_description separately for better parsing
    if (errorDescription) {
      searchParams.set("error_description", errorDescription)
    }
  }

  const destination = `${redirectPath}${searchParams.size ? `?${searchParams.toString()}` : ""}`
  return NextResponse.redirect(new URL(destination, getBaseUrl()))
}

