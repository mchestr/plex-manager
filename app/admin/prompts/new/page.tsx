import { notFound } from "next/navigation"

import { PromptEditor } from "@/components/admin/prompts/editor/prompt-editor"
import { Alert } from "@/components/ui/alert"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { getPromptTemplateDetail } from "@/lib/admin/prompts/queries"
import { getFormat } from "@/lib/settings/app-settings"
import { recordIdSchema } from "@/lib/validations/params"
import { STYLE_GUIDE_MAX_CHARS } from "@/lib/validations/prompt"

/** A v2 template's text as a style guide's start: the first 1,200 characters, and a note when text was cut. */
async function copiedFrom(fromParam: string | string[] | undefined) {
  const id = recordIdSchema.safeParse(fromParam)
  if (!id.success) return null
  const source = await getPromptTemplateDetail(id.data)
  if (!source) return null
  return {
    initial: { name: `${source.name} style guide`.slice(0, 80), template: source.template.slice(0, STYLE_GUIDE_MAX_CHARS) },
    source,
  }
}

/** `/admin/prompts/new` (P10.4): a new style guide, optionally copied from a v2 template (`?from=`). */
export default async function NewPromptTemplatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const [copy, f] = await Promise.all([copiedFrom((await searchParams).from), getFormat()])
  const cut = copy && copy.source.length > STYLE_GUIDE_MAX_CHARS

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-8 p-4 sm:p-6">
      <PageHeader
        title="New style guide"
        description="Plain text of at most 1,200 characters, with no placeholders. Rewind appends it to the prompt."
        breadcrumbs={[{ label: "Prompts", href: "/admin/prompts" }, { label: "New style guide" }]}
        data-testid="admin-prompt-new-heading"
      />
      {copy && (
        <Alert tone={cut ? "warning" : "info"} data-testid="admin-prompt-copy-note">
          {cut
            ? `Copied the first ${f.number(STYLE_GUIDE_MAX_CHARS)} of ${f.number(copy.source.length)} characters from ${copy.source.name}. Remove its placeholders before you save.`
            : `Copied from ${copy.source.name}. Remove its placeholders before you save.`}
        </Alert>
      )}
      <PromptEditor initial={copy?.initial} cancelHref="/admin/prompts" />
    </div>
  )
}
