import type { Metadata } from "next"
import { connection } from "next/server"

import { LastSaved } from "@/components/admin/settings/last-saved"
import { AiSection } from "@/components/admin/settings/sections/ai-section"
import { AssistantSection } from "@/components/admin/settings/sections/assistant-section"
import { JudgeNightlySection } from "@/components/admin/settings/sections/judge-nightly-section"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { getAdminSettings } from "@/lib/data/admin-settings"
import { getAssistantSources } from "@/lib/data/assistant-sources"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"
import { getSettingsHealth } from "@/lib/settings/connection-health"

export const metadata: Metadata = { title: "AI settings" }

/**
 * AI settings, the third tab of the AI section: the providers and spend caps,
 * conversation review, and the assistant's sources, moved here from the
 * settings page's AI group with the same props.
 */
export default async function AiSettingsPage() {
  await assertAdmin()
  // The health check reads the clock: render per request, never at build
  await connection()
  const [settings, health, audit, assistantSources] = await Promise.all([
    getAdminSettings(),
    getSettingsHealth(),
    getSettingsAuditMeta(),
    getAssistantSources(),
  ])
  // Nothing before a first save, so a read-only section shows no empty footer
  const saved = (id: keyof typeof audit) => audit[id] && <LastSaved id={id} meta={audit[id]} />

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="AI settings" data-testid="admin-ai-settings-header" />
      <AiSection
        chat={settings.chatLLMProvider}
        wrapped={settings.wrappedLLMProvider}
        judge={settings.judgeLLMProvider}
        llmDisabled={settings.config.llmDisabled}
        caps={{
          perUserUsd: settings.config.llmDailyCapPerUserUsd,
          adminUsd: settings.config.llmDailyCapAdminUsd,
          serverUsd: settings.config.llmDailyCapServerUsd,
        }}
        health={health.ai}
        footerMeta={saved("ai")}
      />
      <JudgeNightlySection
        saved={{
          judgeNightlyEnabled: settings.config.judgeNightlyEnabled,
          judgeSampleRate: settings.config.judgeSampleRate,
          judgeMinTurns: settings.config.judgeMinTurns,
          llmDailyCapJudgeUsd: settings.config.llmDailyCapJudgeUsd,
        }}
        footerMeta={saved("judge")}
      />
      <AssistantSection sources={assistantSources} />
    </div>
  )
}
