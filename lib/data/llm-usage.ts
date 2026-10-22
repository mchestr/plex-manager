/**
 * The LLM usage pages' reads (P11.5, BP-06): server-only, each admin-checked
 * next to its data.
 *
 * @module lib/data/llm-usage
 */

import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { llmUsageIdSchema, userIdSchema } from "@/lib/validations/shared-schemas"

const recordsInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  userId: userIdSchema.optional(),
  conversationId: z.string().min(1).max(100).optional(),
})

/**
 * A page of LLM usage records, newest first, optionally for one member or one
 * chat conversation (admin only).
 *
 * @throws a ZodError for a malformed page or id
 */
export async function getLLMUsageRecords(raw: z.input<typeof recordsInput> = {}) {
  await assertAdmin()
  const { page, pageSize, userId, conversationId } = recordsInput.parse(raw)

  const where = {
    ...(userId ? { userId } : {}),
    ...(conversationId ? { chatConversationId: conversationId } : {}),
  }

  const [records, total] = await Promise.all([
    prisma.lLMUsage.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        wrapped: { select: { id: true, year: true, status: true } },
        chatConversation: { select: { id: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lLMUsage.count({ where }),
  ])

  return {
    records,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

/** One LLM usage record (admin only), or null when the id is malformed or unknown. */
export async function getLLMUsageById(id: string) {
  await assertAdmin()
  const parsed = llmUsageIdSchema.safeParse(id)
  if (!parsed.success) return null

  return prisma.lLMUsage.findUnique({
    where: { id: parsed.data },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      wrapped: { select: { id: true, year: true, status: true, generatedAt: true } },
      chatConversation: { select: { id: true, createdAt: true } },
    },
  })
}
