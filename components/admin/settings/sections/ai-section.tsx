"use client"

import { useState } from "react"

import { LLMProviderFields } from "@/components/admin/settings/llm-provider-form"
import { LlmSpendCapsForm } from "@/components/admin/settings/llm-spend-caps-form"
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
  caps: { perUserUsd: number; adminUsd: number; serverUsd: number }
  health: SectionHealth
}

/**
 * The AI provider section (6.4): the master "AI features" switch, then Tabs
 * for the Admin assistant and Rewind generation models. One footer saves
 * whichever tabs changed, and Test connection checks the open tab.
 */
export function AiSection({ chat, wrapped, llmDisabled, caps, health }: AiSectionProps) {
  const [tab, setTab] = useState<Purpose>("chat")
  const forms = { chat: useLLMProviderForm(chat, "chat"), wrapped: useLLMProviderForm(wrapped, "wrapped") }
  const both = [forms.chat.settingsForm, forms.wrapped.settingsForm]

  const form: SettingsFormState = {
    isDirty: both.some((f) => f.isDirty),
    isPending: both.some((f) => f.isPending),
    onDiscard: () => both.forEach((f) => f.onDiscard()),
    onSave: () => both.filter((f) => f.isDirty).forEach((f) => f.onSave()),
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
    >
      <LLMToggle disabled={llmDisabled} />
      <Tabs value={tab} onValueChange={(value) => setTab(value === "wrapped" ? "wrapped" : "chat")}>
        <TabsList aria-label="Model configuration" data-testid="settings-ai-tabs">
          <TabsTab value="chat" data-testid="settings-ai-tab-chat">
            Admin assistant
            {forms.chat.settingsForm.isDirty && <span className="sr-only"> (unsaved changes)</span>}
          </TabsTab>
          <TabsTab value="wrapped" data-testid="settings-ai-tab-wrapped">
            Rewind generation
            {forms.wrapped.settingsForm.isDirty && <span className="sr-only"> (unsaved changes)</span>}
          </TabsTab>
        </TabsList>
        <TabsPanel value="chat" className="flex flex-col gap-6">
          <LLMProviderFields purpose="chat" state={forms.chat} />
          <div className="border-t pt-4">
            <LlmSpendCapsForm perUserUsd={caps.perUserUsd} adminUsd={caps.adminUsd} serverUsd={caps.serverUsd} />
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
