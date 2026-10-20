"use server"

/**
 * Admin actions for the prompt templates: the v2 prompt (`v2-full`) and the
 * Rewind 2026 style guide (`rewind-style-guide`, P5.9), a block of at most
 * 1,200 characters without placeholders that the frozen v3 prompt appends.
 * Every mutation is audited as `PROMPT_TEMPLATE_CHANGED` with the kind and a
 * redacted diff (changed field names only, never the template text), and a
 * change of the active template runs in one transaction, so concurrent saves
 * cannot leave zero or two active templates of one kind.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { requireAdmin } from "@/lib/admin"
import type { PromptTemplate } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent, recordAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { recordIdSchema } from "@/lib/validations/params"
import { styleGuideSchema } from "@/lib/wrapped/prompt/rewind-2026"
import { PROMPT_TEMPLATE_KINDS, type PromptTemplateKind } from "@/lib/wrapped/prompt/store"

const promptTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  template: z.string().min(1, "Template is required"),
  isActive: z.boolean().optional(),
  kind: z.enum(PROMPT_TEMPLATE_KINDS).default("v2-full"),
})

/** Why `template` cannot be saved as `kind`, or null. */
function templateIssue(kind: string, template: string): string | null {
  if (kind !== "rewind-style-guide") return null
  const parsed = styleGuideSchema.safeParse(template)
  return parsed.success ? null : parsed.error.issues[0].message
}

export type PromptTemplateInput = z.input<typeof promptTemplateSchema>

type AuditedTemplate = Pick<PromptTemplate, "name" | "description" | "template" | "isActive" | "kind">

function auditedFields({ name, description, template, isActive }: AuditedTemplate) {
  return { name, description, template, isActive }
}

const auditKind = (before: AuditedTemplate | null, after: AuditedTemplate | null) => (after ?? before)?.kind

function templateDiff(
  action: "created" | "updated" | "deleted" | "activated",
  templateId: string,
  before: AuditedTemplate | null,
  after: AuditedTemplate | null
) {
  return {
    action,
    templateId,
    kind: auditKind(before, after),
    ...configDiff("prompt", before && auditedFields(before), after ? auditedFields(after) : {}),
  }
}

/**
 * Makes `id` the only active template of its kind, inside the caller's
 * transaction. The first statement locks every row of that kind, so a
 * concurrent activation waits for this one to commit instead of leaving two
 * templates active.
 */
async function activateOnly(tx: PrismaTransactionClient, id: string, kind: PromptTemplateKind | string) {
  await tx.promptTemplate.updateMany({ where: { kind }, data: { isActive: false } })
  return tx.promptTemplate.update({ where: { id }, data: { isActive: true } })
}

/**
 * Get all prompt templates
 */
export async function getPromptTemplates() {
  await requireAdmin()

  const templates = await prisma.promptTemplate.findMany({
    orderBy: [
      { isActive: "desc" },
      { updatedAt: "desc" },
    ],
  })

  return { success: true, data: templates }
}

/**
 * Get a single prompt template by ID
 */
export async function getPromptTemplate(id: string) {
  await requireAdmin()

  const template = await prisma.promptTemplate.findUnique({
    where: { id },
  })

  if (!template) {
    return { success: false, error: "Template not found" }
  }

  return { success: true, data: template }
}

/**
 * Create a new prompt template
 */
export const createPromptTemplate = adminAction({
  input: promptTemplateSchema,
  fallbackError: "Failed to create prompt template",
  handler: async (validated, { userId }) => {
    const issue = templateIssue(validated.kind, validated.template)
    if (issue) return fail("VALIDATION", issue)

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.promptTemplate.create({
        data: {
          name: validated.name,
          description: validated.description || null,
          template: validated.template,
          kind: validated.kind,
          isActive: false,
          updatedBy: userId,
        },
      })
      return validated.isActive ? activateOnly(tx, created.id, created.kind) : created
    })

    logAuditEvent(AuditEventType.PROMPT_TEMPLATE_CHANGED, userId, templateDiff("created", template.id, null, template))
    revalidatePath("/admin/prompts")
    return ok(template)
  },
})

/**
 * Update an existing prompt template
 */
export const updatePromptTemplate = adminAction({
  input: promptTemplateSchema.omit({ kind: true }).extend({ id: recordIdSchema }),
  fallbackError: "Failed to update prompt template",
  handler: async ({ id, ...validated }, { userId }) => {
    const existing = await prisma.promptTemplate.findUnique({ where: { id } })
    if (!existing) return fail("NOT_FOUND", "Template not found")
    const issue = templateIssue(existing.kind, validated.template)
    if (issue) return fail("VALIDATION", issue)

    const template = await prisma.$transaction(async (tx) => {
      const updated = await tx.promptTemplate.update({
        where: { id },
        data: {
          name: validated.name,
          description: validated.description || null,
          template: validated.template,
          version: existing.version + 1,
          updatedBy: userId,
          // Switching a template off needs no lock; switching one on goes through activateOnly
          ...(validated.isActive === false && { isActive: false }),
        },
      })
      return validated.isActive && !existing.isActive ? activateOnly(tx, id, existing.kind) : updated
    })

    logAuditEvent(AuditEventType.PROMPT_TEMPLATE_CHANGED, userId, templateDiff("updated", id, existing, template))
    revalidatePath("/admin/prompts")
    revalidatePath(`/admin/prompts/${id}`)
    return ok(template)
  },
})

/**
 * Delete a prompt template
 */
export const deletePromptTemplate = adminAction({
  input: recordIdSchema,
  fallbackError: "Failed to delete prompt template",
  handler: async (id, { userId }) => {
    const existing = await prisma.promptTemplate.findUnique({ where: { id } })
    if (!existing) return fail("NOT_FOUND", "Template not found")

    // Don't allow deleting the active template
    if (existing.isActive) {
      return fail("CONFLICT", "Cannot delete the active template. Please activate another template first.")
    }

    await prisma.promptTemplate.delete({ where: { id } })

    logAuditEvent(AuditEventType.PROMPT_TEMPLATE_CHANGED, userId, templateDiff("deleted", id, existing, null))
    revalidatePath("/admin/prompts")
    return ok(null)
  },
})

/**
 * Set a template as active (deactivates all others), in one transaction
 */
export const setActivePromptTemplate = adminAction({
  input: recordIdSchema,
  fallbackError: "Failed to set active template",
  handler: async (id, { userId }) => {
    const found = await prisma.$transaction(async (tx) => {
      const template = await tx.promptTemplate.findUnique({ where: { id } })
      if (!template) return false

      await activateOnly(tx, id, template.kind)
      await recordAuditEvent(
        AuditEventType.PROMPT_TEMPLATE_CHANGED,
        userId,
        templateDiff("activated", id, template, { ...template, isActive: true }),
        tx
      )
      return true
    })
    if (!found) return fail("NOT_FOUND", "Template not found")

    revalidatePath("/admin/prompts")
    return ok(null)
  },
})
