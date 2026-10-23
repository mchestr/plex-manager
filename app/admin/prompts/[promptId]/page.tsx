import { notFound } from "next/navigation"

import { ExpandablePrompt } from "@/components/admin/prompts/expandable-prompt"
import { PromptDetailActions } from "@/components/admin/prompts/prompt-detail-actions"
import { Alert } from "@/components/ui/alert"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { getAdminGate } from "@/lib/admin"
import { currentStyleGuideName, getPromptTemplateDetail, seasonVoiceNote } from "@/lib/admin/prompts/queries"
import { getFormat } from "@/lib/settings/app-settings"
import { STYLE_GUIDE_MAX_CHARS } from "@/lib/validations/prompt"

/** `/admin/prompts/[promptId]` (P10.4): one template, its state and its text. */
export default async function PromptTemplatePage({ params }: { params: Promise<{ promptId: string }> }) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const { promptId } = await params
  const f = await getFormat()
  const [prompt, current, seasonNote] = await Promise.all([
    getPromptTemplateDetail(promptId),
    currentStyleGuideName(),
    seasonVoiceNote(f.settings),
  ])
  if (!prompt) notFound()

  const facts = [
    { term: "Version", value: `v${prompt.version}` },
    {
      term: "Length",
      value: prompt.status === "v2" ? `${f.number(prompt.length)} characters` : `${f.number(prompt.length)} of ${f.number(STYLE_GUIDE_MAX_CHARS)} characters`,
    },
    { term: "Created", value: f.dateTime(prompt.createdAt, { zoneLabel: true }) },
    { term: "Updated", value: f.dateTime(prompt.updatedAt, { zoneLabel: true }) },
    { term: "Updated by", value: prompt.updatedByName ?? "—" },
  ]

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={prompt.name}
        description={prompt.description ?? undefined}
        breadcrumbs={[{ label: "Prompts", href: "/admin/prompts" }, { label: prompt.name }]}
        meta={<StatusBadge domain="prompt" value={prompt.status} />}
        actions={<PromptDetailActions prompt={{ id: prompt.id, name: prompt.name, status: prompt.status }}current={current} seasonNote={seasonNote} />}
        data-testid="admin-prompt-detail-heading"
      />
      {prompt.status === "v2" && (
        <Alert tone="info" data-testid="admin-prompt-v2-notice">
          This is a v2 template. Rewind 2026 only appends a style guide, so this text isn&apos;t used.
        </Alert>
      )}
      <dl className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        {facts.map(({ term, value }) => (
          <div key={term} className="flex flex-col gap-1">
            <dt className="text-label text-muted-foreground">{term}</dt>
            <dd className="text-ui text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <ExpandablePrompt content={prompt.template} title={prompt.status === "v2" ? "Template" : "Style guide"} characterCount={prompt.length} />
    </div>
  )
}
