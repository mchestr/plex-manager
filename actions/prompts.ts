"use server"

/**
 * Admin actions for the prompt templates: the Rewind 2026 style guide
 * (`rewind-style-guide`, P5.9), a block of at most 1,200 characters without
 * placeholders that the frozen v3 prompt appends, validated with the shared
 * `styleGuideFormSchema` (P10.4). A v2 template (`v2-full`) is read-only:
 * it can only be deleted. Reads live in `lib/admin/prompts/queries.ts`.
 * Every mutation is audited as `PROMPT_TEMPLATE_CHANGED` with the kind and a
 * redacted diff (changed field names only, never the template text), and a
 * change of the active template runs in one transaction, so concurrent saves
 * cannot leave zero or two active templates of one kind.
 */

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import type { PromptTemplate } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent, recordAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { recordIdSchema } from "@/lib/validations/params"
import { styleGuideFormSchema } from "@/lib/validations/prompt"

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
async function activateOnly(tx: PrismaTransactionClient, id: string, kind: string) {
  await tx.promptTemplate.updateMany({ where: { kind }, data: { isActive: false } })
  return tx.promptTemplate.update({ where: { id }, data: { isActive: true } })
}

const V2_READ_ONLY = "This is a v2 template. Rewind 2026 only appends a style guide, so this text isn't used."

/**
 * Create a style guide. New v2 templates are not created: Rewind 2026 does
 * not read them.
 */
export const createPromptTemplate = adminAction({
  input: styleGuideFormSchema,
  fallbackError: "Failed to create the style guide",
  handler: async (validated, { userId }) => {
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
 * Update a style guide; a v2 template is read-only.
 */
export const updatePromptTemplate = adminAction({
  input: styleGuideFormSchema.omit({ kind: true }).extend({ id: recordIdSchema }),
  fallbackError: "Failed to save the style guide",
  handler: async ({ id, ...validated }, { userId }) => {
    const existing = await prisma.promptTemplate.findUnique({ where: { id } })
    if (!existing) return fail("NOT_FOUND", "Template not found")
    if (existing.kind !== "rewind-style-guide") return fail("CONFLICT", V2_READ_ONLY)

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

    // The style guide in use can't go; a v2 template is never used, so it can
    if (existing.isActive && existing.kind === "rewind-style-guide") {
      return fail("CONFLICT", "This style guide is in use. Use another one for Rewind first.")
    }

    await prisma.promptTemplate.delete({ where: { id } })

    logAuditEvent(AuditEventType.PROMPT_TEMPLATE_CHANGED, userId, templateDiff("deleted", id, existing, null))
    revalidatePath("/admin/prompts")
    return ok(null)
  },
})

/**
 * Use a style guide for Rewind (the others of its kind stop), in one transaction
 */
export const setActivePromptTemplate = adminAction({
  input: recordIdSchema,
  fallbackError: "Failed to use this style guide",
  handler: async (id, { userId }) => {
    const found = await prisma.$transaction(async (tx) => {
      const template = await tx.promptTemplate.findUnique({ where: { id } })
      if (!template) return "missing"
      if (template.kind !== "rewind-style-guide") return "v2"

      await activateOnly(tx, id, template.kind)
      await recordAuditEvent(
        AuditEventType.PROMPT_TEMPLATE_CHANGED,
        userId,
        templateDiff("activated", id, template, { ...template, isActive: true }),
        tx
      )
      return "ok"
    })
    if (found === "missing") return fail("NOT_FOUND", "Template not found")
    if (found === "v2") return fail("CONFLICT", V2_READ_ONLY)

    revalidatePath("/admin/prompts")
    revalidatePath(`/admin/prompts/${id}`)
    return ok(null)
  },
})
