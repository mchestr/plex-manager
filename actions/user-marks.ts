"use server"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import {
  CreateUserMediaMarkSchema,
  type MediaType,
  type MarkType,
} from "@/lib/validations/user-media"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { revalidatePath } from "next/cache"

const logger = createLogger("USER-MARKS")

/**
 * Get user's media marks with optional filters
 */
export async function getUserMediaMarks(filters?: {
  mediaType?: MediaType
  markType?: MarkType
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const where: {
      userId: string
      mediaType?: MediaType
      markType?: MarkType
    } = {
      userId: session.user.id,
    }

    if (filters?.mediaType) {
      where.mediaType = filters.mediaType
    }
    if (filters?.markType) {
      where.markType = filters.markType
    }

    const marks = await prisma.userMediaMark.findMany({
      where,
      orderBy: { markedAt: "desc" },
    })

    return { success: true, data: marks }
  } catch (error) {
    logger.error("Error fetching user media marks", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch user media marks",
    }
  }
}

/**
 * Create a user media mark
 */
export async function createUserMediaMark(data: unknown) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    const validated = CreateUserMediaMarkSchema.parse(data)

    // Check if mark already exists for this media
    const existing = await prisma.userMediaMark.findFirst({
      where: {
        userId: session.user.id,
        plexRatingKey: validated.plexRatingKey,
        markType: validated.markType,
      },
    })

    if (existing) {
      return { success: false, error: "Mark already exists for this media" }
    }

    const mark = await prisma.userMediaMark.create({
      data: {
        userId: session.user.id,
        mediaType: validated.mediaType,
        plexRatingKey: validated.plexRatingKey,
        radarrId: validated.radarrId,
        sonarrId: validated.sonarrId,
        title: validated.title,
        year: validated.year,
        seasonNumber: validated.seasonNumber,
        episodeNumber: validated.episodeNumber,
        parentTitle: validated.parentTitle,
        markType: validated.markType,
        note: validated.note,
        markedVia: validated.markedVia,
        discordChannelId: validated.discordChannelId,
      },
    })

    revalidatePath("/media")
    return { success: true, data: mark }
  } catch (error) {
    logger.error("Error creating user media mark", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create user media mark",
    }
  }
}

/**
 * Delete a user media mark
 */
export async function deleteUserMediaMark(id: string) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  try {
    // Verify mark belongs to user
    const mark = await prisma.userMediaMark.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!mark) {
      return { success: false, error: "Mark not found" }
    }

    if (mark.userId !== session.user.id) {
      return { success: false, error: "Unauthorized to delete this mark" }
    }

    await prisma.userMediaMark.delete({
      where: { id },
    })

    revalidatePath("/media")
    return { success: true }
  } catch (error) {
    logger.error("Error deleting user media mark", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete user media mark",
    }
  }
}
