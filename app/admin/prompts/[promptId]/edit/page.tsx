import { notFound } from "next/navigation"

import { PromptEditor } from "@/components/admin/prompts/editor/prompt-editor"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { getPromptTemplateDetail } from "@/lib/admin/prompts/queries"
import { promptDetail } from "@/lib/admin/routes"

/** `/admin/prompts/[promptId]/edit` (P10.4): the style-guide editor; a v2 template opens read-only. */
export default async function EditPromptTemplatePage({ params }: { params: Promise<{ promptId: string }> }) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const { promptId } = await params
  const prompt = await getPromptTemplateDetail(promptId)
  if (!prompt) notFound()

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title={`Edit ${prompt.name}`}
        breadcrumbs={[
          { label: "Prompts", href: "/admin/prompts" },
          { label: prompt.name, href: promptDetail(prompt.id) },
          { label: "Edit" },
        ]}
        data-testid="admin-prompt-edit-heading"
      />
      <PromptEditor
        prompt={{
          id: prompt.id,
          name: prompt.name,
          description: prompt.description,
          template: prompt.template,
          isActive: prompt.isActive,
          kind: prompt.kind,
        }}
        cancelHref={promptDetail(prompt.id)}
      />
    </div>
  )
}
