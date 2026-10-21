/**
 * The prompt-template rules, shared by `actions/prompts.ts`, the admin
 * editor and the playground's dry-run input (P10.4).
 *
 * Since P5.9 the Rewind system prompt is frozen in code; what an admin writes
 * is a style guide that the prompt appends last: plain text of at most 1,200
 * characters, with no `{{placeholders}}`, because a placeholder could carry
 * member data into the shared, cached system block.
 *
 * @module lib/validations/prompt
 */

import { z } from "zod"

/** The longest style guide the prompt appends (design 8.3). */
export const STYLE_GUIDE_MAX_CHARS = 1200

const PLACEHOLDER = /\{\{|\}\}/

/** A style guide's text; empty is allowed here, so a dry run can pass "none". */
export const styleGuideSchema = z
  .string()
  .max(STYLE_GUIDE_MAX_CHARS, "A style guide is at most 1,200 characters")
  .refine((text) => !PLACEHOLDER.test(text), "A style guide cannot use placeholders")

/** The editor's fields, as the create and update actions take them. */
export const styleGuideFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "A name is at most 80 characters"),
  description: z.string().trim().max(280, "A description is at most 280 characters").optional(),
  template: styleGuideSchema.refine((text) => text.trim().length > 0, "Write the style guide"),
  isActive: z.boolean().optional(),
  kind: z.literal("rewind-style-guide").default("rewind-style-guide"),
})

export type StyleGuideFormInput = z.input<typeof styleGuideFormSchema>

export type StyleGuideField = "name" | "description" | "template"

/** The first message for each field that fails, for the editor's inline errors. */
export function styleGuideFieldErrors(values: StyleGuideFormInput): Partial<Record<StyleGuideField, string>> {
  const parsed = styleGuideFormSchema.safeParse(values)
  if (parsed.success) return {}
  const { fieldErrors } = z.flattenError(parsed.error)
  return {
    ...(fieldErrors.name && { name: fieldErrors.name[0] }),
    ...(fieldErrors.description && { description: fieldErrors.description[0] }),
    ...(fieldErrors.template && { template: fieldErrors.template[0] }),
  }
}
