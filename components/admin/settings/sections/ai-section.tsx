"use client"

import { useState, type ReactNode } from "react"

import { LLMProviderFields } from "@/components/admin/settings/llm-provider-form"
import { LlmSpendCapsFields, useSpendCapsForm, type SpendCaps } from "@/components/admin/settings/llm-spend-caps-form"
import { LLMToggle } from "@/components/admin/settings/llm-toggle"
import { SettingsSection } from "@/components/ui/settings-section"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import type { SettingsFormState } from "@/hooks/admin/use-settings-form"
import { useLLMProviderForm, type StoredLLMProvider } from "@/hooks/use-llm-provider-form"
import type { SectionHealth } from "@/lib/settings/connection-status"

type Purpose = "chat" | "wrapped"

interface AiSectionProps {
  chat: StoredLLMProvider | null
  wrapped: StoredLLMProvider | null
  llmDisabled: boolean
  caps: SpendCaps
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/**
 * The AI provider section (6.4): the master "AI features" switch, then Tabs
 * for the Admin assistant (with its spend caps) and Rewind generation. One
 * footer saves whichever parts changed, and Test connection checks the open
 * tab. A key that must be re-entered blocks Test and Save (SEC-31).
 */
export function AiSection({ chat, wrapped, llmDisabled, caps, health, footerMeta }: AiSectionProps) {
  const [tab, setTab] = useState<Purpose>("chat")
  const forms = { chat: useLLMProviderForm(chat, "chat"), wrapped: useLLMProviderForm(wrapped, "wrapped") }
  const spendCaps = useSpendCapsForm(caps)
  const parts = [forms.chat.settingsForm, forms.wrapped.settingsForm, spendCaps.form]

  const form: SettingsFormState = {
    isDirty: parts.some((f) => f.isDirty),
    isPending: parts.some((f) => f.isPending),
    onDiscard: () => parts.forEach((f) => f.onDiscard()),
    onSave: () => parts.filter((f) => f.isDirty).forEach((f) => f.onSave()),
    blockedReason: parts.find((f) => f.isDirty && f.blockedReason)?.blockedReason,
  }

  return (
    <SettingsSection
      id="ai"
      title="AI provider"
      description="Writes Rewind copy and answers questions in the admin assistant."
      status={health.status}
      checkedAt={health.checkedAt}
      onTest={() => forms[tab].testConnection()}
      form={form}
      footerMeta={footerMeta}
    >
      <LLMToggle disabled={llmDisabled} />
      <Tabs value={tab} onValueChange={(value) => setTab(value === "wrapped" ? "wrapped" : "chat")}>
        <TabsList aria-label="Model configuration" data-testid="settings-ai-tabs">
          <TabsTab value="chat" data-testid="settings-ai-tab-chat">
            Admin assistant
            {(forms.chat.settingsForm.isDirty || spendCaps.form.isDirty) && <span className="sr-only"> (unsaved changes)</span>}
          </TabsTab>
          <TabsTab value="wrapped" data-testid="settings-ai-tab-wrapped">
            Rewind generation
            {forms.wrapped.settingsForm.isDirty && <span className="sr-only"> (unsaved changes)</span>}
          </TabsTab>
        </TabsList>
        <TabsPanel value="chat" className="flex flex-col gap-6">
          <LLMProviderFields purpose="chat" state={forms.chat} />
          <div className="border-t pt-4">
            <LlmSpendCapsFields state={spendCaps} disabled={spendCaps.form.isPending} />
          </div>
        </TabsPanel>
        <TabsPanel value="wrapped" className="flex flex-col gap-6">
          <p className="text-label text-muted-foreground">The model that writes each issue&apos;s lines; mode and budget are in the Rewind section.</p>
          <LLMProviderFields purpose="wrapped" state={forms.wrapped} />
        </TabsPanel>
      </Tabs>
    </SettingsSection>
  )
}
