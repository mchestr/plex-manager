"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const promptTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  template: z.string().min(1, "Template is required"),
  isActive: z.boolean().optional(),
})

export type PromptTemplateInput = z.infer<typeof promptTemplateSchema>

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
 * Get the active prompt template
 */
export async function getActivePromptTemplate() {
  const template = await prisma.promptTemplate.findFirst({
    where: { isActive: true },
  })

  return template
}

/**
 * Create a new prompt template
 */
export async function createPromptTemplate(data: PromptTemplateInput) {
  const session = await requireAdmin()

  try {
    const validated = promptTemplateSchema.parse(data)

    // If this template should be active, deactivate all others first
    if (validated.isActive) {
      await prisma.promptTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const template = await prisma.promptTemplate.create({
      data: {
        name: validated.name,
        description: validated.description || null,
        template: validated.template,
        isActive: validated.isActive || false,
        updatedBy: session.user.id,
      },
    })

    revalidatePath("/admin/prompts")
    return { success: true, data: template }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message }
    }
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to create prompt template" }
  }
}

/**
 * Update an existing prompt template
 */
export async function updatePromptTemplate(id: string, data: PromptTemplateInput) {
  const session = await requireAdmin()

  try {
    const validated = promptTemplateSchema.parse(data)

    // Check if template exists
    const existing = await prisma.promptTemplate.findUnique({
      where: { id },
    })

    if (!existing) {
      return { success: false, error: "Template not found" }
    }

    // If this template should be active, deactivate all others first
    if (validated.isActive && !existing.isActive) {
      await prisma.promptTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const template = await prisma.promptTemplate.update({
      where: { id },
      data: {
        name: validated.name,
        description: validated.description || null,
        template: validated.template,
        isActive: validated.isActive ?? existing.isActive,
        version: existing.version + 1,
        updatedBy: session.user.id,
      },
    })

    revalidatePath("/admin/prompts")
    revalidatePath(`/admin/prompts/${id}`)
    return { success: true, data: template }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0].message }
    }
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update prompt template" }
  }
}

/**
 * Delete a prompt template
 */
export async function deletePromptTemplate(id: string) {
  await requireAdmin()

  try {
    // Don't allow deleting the active template
    const existing = await prisma.promptTemplate.findUnique({
      where: { id },
    })

    if (!existing) {
      return { success: false, error: "Template not found" }
    }

    if (existing.isActive) {
      return { success: false, error: "Cannot delete the active template. Please activate another template first." }
    }

    await prisma.promptTemplate.delete({
      where: { id },
    })

    revalidatePath("/admin/prompts")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to delete prompt template" }
  }
}

/**
 * Set a template as active (deactivates all others)
 */
export async function setActivePromptTemplate(id: string) {
  await requireAdmin()

  try {
    const template = await prisma.promptTemplate.findUnique({
      where: { id },
    })

    if (!template) {
      return { success: false, error: "Template not found" }
    }

    // Deactivate all templates
    await prisma.promptTemplate.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Activate the selected template
    await prisma.promptTemplate.update({
      where: { id },
      data: { isActive: true },
    })

    revalidatePath("/admin/prompts")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to set active template" }
  }
}

