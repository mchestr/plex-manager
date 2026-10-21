import Link from "next/link"
import { notFound } from "next/navigation"

import { PromptsTable } from "@/components/admin/prompts/prompts-table"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { listPromptTemplates, seasonVoiceNote } from "@/lib/admin/prompts/queries"
import { newStyleGuide } from "@/lib/admin/routes"
import { getFormat } from "@/lib/settings/app-settings"

export const dynamic = "force-dynamic"

/** `/admin/prompts` (P10.4): the Rewind style guides and the old v2 templates. */
export default async function PromptsPage() {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const f = await getFormat()
  const [rows, seasonNote] = await Promise.all([listPromptTemplates(), seasonVoiceNote(f.settings)])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Prompts"
        description="A style guide sets the voice of every member's Rewind. It is appended to the prompt, which is fixed in code."
        actions={
          <Button nativeButton={false} render={<Link href={newStyleGuide()} />} data-testid="admin-prompts-new">
            New style guide
          </Button>
        }
        data-testid="admin-prompts-heading"
      />
      <PromptsTable rows={rows} seasonNote={seasonNote} />
    </div>
  )
}
