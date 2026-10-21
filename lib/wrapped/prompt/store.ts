/**
 * Reads of the admin's prompt templates, for server code only (RWP-13).
 *
 * These are plain Prisma reads, not Server Actions, so no client can call
 * them: the template text never leaves the server except through the admin
 * prompt pages, which check the session themselves.
 *
 * - `findRewindStyleGuide()`: the active `rewind-style-guide` block that v3
 *   appends to its frozen system prompt (at most 1,200 characters).
 *
 * Each kind has at most one active row; activating one leaves the other kind
 * alone.
 *
 * @module lib/wrapped/prompt/store
 */

import "server-only"

import { prisma } from "@/lib/prisma"

export const PROMPT_TEMPLATE_KINDS = ["v2-full", "rewind-style-guide"] as const

export type PromptTemplateKind = (typeof PROMPT_TEMPLATE_KINDS)[number]

/** The active Rewind style guide's text, or null when there is none. */
export async function findRewindStyleGuide(): Promise<string | null> {
  const row = await prisma.promptTemplate.findFirst({
    where: { isActive: true, kind: "rewind-style-guide" },
    select: { template: true },
  })
  return row?.template ?? null
}
