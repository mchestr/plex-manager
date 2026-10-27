"use client"

import { useState, type ReactNode } from "react"

import { LLMProviderFields } from "@/components/admin/settings/llm-provider-form"
import { LLMProviderSummary } from "@/components/admin/settings/llm-provider-summary"
import { LlmSpendCapsFields, SpendCapsSummary, useSpendCapsForm, type SpendCaps } from "@/components/admin/settings/llm-spend-caps-form"
import { LLMToggle } from "@/components/admin/settings/llm-toggle"
import { SettingsSection } from "@/components/ui/settings-section"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import type { SettingsFormState } from "@/hooks/admin/use-settings-form"
import { useLLMProviderForm, type StoredLLMProvider } from "@/hooks/use-llm-provider-form"
import type { SectionHealth } from "@/lib/settings/connection-status"

type Purpose = "chat" | "wrapped"

const TABS: { value: Purpose; label: string }[] = [
  { value: "chat", label: "Admin assistant" },
  { value: "wrapped", label: "Rewind generation" },
]

interface AiSectionProps {
  chat: StoredLLMProvider | null
  wrapped: StoredLLMProvider | null
  llmDisabled: boolean
  caps: SpendCaps
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

interface AiTabsProps {
  tab: Purpose
  onTabChange: (tab: Purpose) => void
  panels: Record<Purpose, ReactNode>
  /** Tabs with unsaved changes, which screen readers hear in the tab's name. */
  unsaved?: Record<Purpose, boolean>
  "data-testid"?: string
}

/** The two purposes as Tabs, the same in both modes, so Edit opens on the tab being read. */
function AiTabs({ tab, onTabChange, panels, unsaved, "data-testid": testId }: AiTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value === "wrapped" ? "wrapped" : "chat")} data-testid={testId}>
      <TabsList aria-label="Model configuration" data-testid="settings-ai-tabs">
        {TABS.map(({ value, label }) => (
          <TabsTab key={value} value={value} data-testid={`settings-ai-tab-${value}`}>
            {label}
            {unsaved?.[value] && <span className="sr-only"> (unsaved changes)</span>}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel value="chat" className="flex flex-col gap-6">
        {panels.chat}
      </TabsPanel>
      <TabsPanel value="wrapped" className="flex flex-col gap-6">
        <p className="text-label text-muted-foreground">The model that writes each issue&apos;s lines; mode and budget are in the Rewind section.</p>
        {panels.wrapped}
      </TabsPanel>
    </Tabs>
  )
}

/** One part of the section's form, and the tab its fields are on. */
interface FormPart {
  tab: Purpose
  form: SettingsFormState
}

/**
 * The section's one form over its three parts: both providers and the spend
 * caps. Save saves every dirty part and succeeds only when each one did, so
 * a failed or invalid part keeps the section open on its errors; when only
 * the other tab's parts failed, that tab opens, since its errors are on its
 * fields. A dirty part's reason blocks Test and Save; with nothing changed,
 * the open tab's does (a key that can't be read), since Test checks that tab.
 */
function combineForms(parts: FormPart[], open: Purpose, onOtherTabFailed: (tab: Purpose) => void): SettingsFormState {
  const dirty = parts.filter(({ form }) => form.isDirty)
  const reasonOf = (list: FormPart[]) => list.find(({ form }) => form.blockedReason)?.form.blockedReason
  return {
    isDirty: dirty.length > 0,
    isPending: parts.some(({ form }) => form.isPending),
    onDiscard: () => parts.forEach(({ form }) => form.onDiscard()),
    onSave: async () => {
      const results = await Promise.all(dirty.map(async ({ tab, form }) => ({ tab, ok: await form.onSave() })))
      const failed = results.filter(({ ok }) => !ok)
      if (failed.length > 0 && !failed.some(({ tab }) => tab === open)) onOtherTabFailed(failed[0].tab)
      return failed.length === 0
    },
    blockedReason: dirty.length > 0 ? reasonOf(dirty) : reasonOf(parts.filter(({ tab }) => tab === open)),
  }
}

/**
 * The AI provider section (6.4). The master "AI features" switch stays live
 * above both modes, since it saves at once. Below it, Tabs for the Admin
 * assistant (with its spend caps) and Rewind generation show each saved
 * provider until Edit, which opens the whole section on the same tab: one
 * footer saves whichever parts changed, and Test connection checks the open
 * tab, with its saved values until they are edited. A key that must be
 * re-entered blocks Test and Save (SEC-31).
 */
export function AiSection({ chat, wrapped, llmDisabled, caps, health, footerMeta }: AiSectionProps) {
  const [tab, setTab] = useState<Purpose>("chat")
  // Above both modes, so a Test from the summary feeds the picker after Edit
  const forms = { chat: useLLMProviderForm(chat, "chat"), wrapped: useLLMProviderForm(wrapped, "wrapped") }
  const spendCaps = useSpendCapsForm(caps)
  const parts: FormPart[] = [
    { tab: "chat", form: forms.chat.settingsForm },
    { tab: "wrapped", form: forms.wrapped.settingsForm },
    { tab: "chat", form: spendCaps.form },
  ]
  const form = combineForms(parts, tab, setTab)

  return (
    <SettingsSection
      id="ai"
      title="AI provider"
      description="Writes Rewind copy and answers questions in the admin assistant."
      status={health.status}
      checkedAt={health.checkedAt}
      onTest={() => forms[tab].testConnection()}
      form={form}
      live={<LLMToggle disabled={llmDisabled} />}
      view={(edit) => {
        const reenter = () => edit({ focus: '[data-testid="llm-api-key-input"]' })
        return (
          <AiTabs
            tab={tab}
            onTabChange={setTab}
            data-testid="settings-ai-summary"
            panels={{
              chat: (
                <>
                  <LLMProviderSummary purpose="chat" stored={chat} onReenter={reenter} />
                  <div className="border-t pt-4">
                    <SpendCapsSummary caps={caps} />
                  </div>
                </>
              ),
              wrapped: <LLMProviderSummary purpose="wrapped" stored={wrapped} onReenter={reenter} />,
            }}
          />
        )
      }}
      footerMeta={footerMeta}
    >
      <AiTabs
        tab={tab}
        onTabChange={setTab}
        unsaved={{ chat: forms.chat.settingsForm.isDirty || spendCaps.form.isDirty, wrapped: forms.wrapped.settingsForm.isDirty }}
        panels={{
          chat: (
            <>
              <LLMProviderFields purpose="chat" state={forms.chat} />
              <div className="border-t pt-4">
                <LlmSpendCapsFields state={spendCaps} disabled={spendCaps.form.isPending} />
              </div>
            </>
          ),
          wrapped: <LLMProviderFields purpose="wrapped" state={forms.wrapped} />,
        }}
      />
    </SettingsSection>
  )
}
