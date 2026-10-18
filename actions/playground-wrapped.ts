"use server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import { memberName } from "@/lib/wrapped/member-name"
import { parseWrappedLLMOutput } from "@/lib/wrapped/parse-llm-output"
import { WrappedStatistics } from "@/types/wrapped"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

const logger = createLogger("PLAYGROUND_WRAPPED")

interface SavePlaygroundWrappedInput {
  llmResponse: string
  statistics: WrappedStatistics
  userName: string
  year: number
}

interface SavePlaygroundWrappedResult {
  success: boolean
  wrappedId?: string
  userId?: string
  error?: string
}

/**
 * Save a wrapped from the playground as a viewable wrapped
 * Admin-only function
 */
export async function savePlaygroundWrapped(input: SavePlaygroundWrappedInput): Promise<SavePlaygroundWrappedResult> {
  try {
    // Require admin authentication
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return {
        success: false,
        error: "Authentication required",
      }
    }

    if (!session.user.isAdmin) {
      return {
        success: false,
        error: "Only admins can save wrappeds from the playground",
      }
    }

    // Find user by Plex username (name field)
    // First try to find by name (which matches Plex username)
    let user = await prisma.user.findFirst({
      where: {
        name: input.userName,
      },
    })

    // If not found by name, try to find by email (in case name doesn't match)
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          email: input.userName,
        },
      })
    }

    // If still not found, we can't create a wrapped
    if (!user) {
      return {
        success: false,
        error: `User "${input.userName}" not found in database. Please ensure the user has logged in at least once.`,
      }
    }

    // Parse and validate the LLM response, then assemble the wrapped data
    const parseResult = parseWrappedLLMOutput(input.llmResponse)
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error,
      }
    }

    // The lookup above may have matched the email, so the stored name comes
    // from the user row, as in generation.
    const wrappedData = assembleWrappedData({
      output: parseResult.output,
      statistics: input.statistics,
      userId: user.id,
      userName: memberName(user) ?? "Viewer",
      year: input.year,
    })

    // Create or update wrapped record. A playground save never creates a
    // share token and keeps an existing one: sharing is the member's choice
    // (enableWrappedShareLink, SEC-16).
    const wrapped = await prisma.plexWrapped.upsert({
      where: {
        userId_year: {
          userId: user.id,
          year: input.year,
        },
      },
      create: {
        userId: user.id,
        year: input.year,
        status: "completed",
        data: JSON.stringify(wrappedData),
        summary: wrappedData.summary || null,
        archetype: wrappedData.archetype?.name || null,
        generatedAt: new Date(),
      },
      update: {
        status: "completed",
        data: JSON.stringify(wrappedData),
        summary: wrappedData.summary || null,
        archetype: wrappedData.archetype?.name || null,
        generatedAt: new Date(),
      },
    })

    // Revalidate relevant paths
    revalidatePath("/admin")
    revalidatePath("/admin/users")
    revalidatePath(`/admin/users/${user.id}/wrapped`)
    revalidatePath("/wrapped")
    revalidatePath("/")

    return {
      success: true,
      wrappedId: wrapped.id,
      userId: user.id,
    }
  } catch (error) {
    logger.error("Error saving wrapped", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save wrapped",
    }
  }
}

