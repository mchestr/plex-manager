/**
 * Reads of the admin's prompt templates, for server code only (RWP-13).
 *
 * These are plain Prisma reads, not Server Actions, so no client can call
 * them: the template text never leaves the server except through the admin
 * prompt pages, which check the session themselves.
 *
 * - `findActivePromptTemplate()`: the active `v2-full` template, which the v2
 *   playground prompt still uses until P8.8.
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

/** The active full v2 template's text, or null for the built-in default. */
export async function findActivePromptTemplate(): Promise<string | null> {
  const row = await prisma.promptTemplate.findFirst({
    where: { isActive: true, kind: "v2-full" },
    select: { template: true },
  })
  return row?.template ?? null
}

/** The active Rewind style guide's text, or null when there is none. */
export async function findRewindStyleGuide(): Promise<string | null> {
  const row = await prisma.promptTemplate.findFirst({
    where: { isActive: true, kind: "rewind-style-guide" },
    select: { template: true },
  })
  return row?.template ?? null
}
