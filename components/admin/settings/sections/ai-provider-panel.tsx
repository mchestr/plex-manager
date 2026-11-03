"use client"

import type { ReactNode } from "react"

import { LLMProviderFields } from "@/components/admin/settings/llm-provider-form"
import { LLMProviderSummary } from "@/components/admin/settings/llm-provider-summary"
import type { LLMProviderFormState, LLMProviderPurpose, StoredLLMProvider } from "@/hooks/use-llm-provider-form"

interface LLMProviderPanelProps {
  purpose: LLMProviderPurpose
  stored: StoredLLMProvider | null
  /** `useLLMProviderForm(stored, purpose)`, held by the AI section above both modes. */
  state: LLMProviderFormState
  /** Edit mode shows the fields; view mode the saved provider. */
  editing: boolean
  /** Locks the fields while another part of the section saves. */
  disabled?: boolean
  /** View mode: opens the form on the API key when the stored one can't be read. */
  onReenter?: () => void
  /** Below the provider, after a rule: the assistant's spend caps, in the same mode. */
  extra?: ReactNode
}

/**
 * One purpose's tab body in the AI section: the saved provider until Edit,
 * then its fields, and below them whatever else that tab edits (the Admin
 * assistant's spend caps). Rewind's tab points to the Rewind settings tab for
 * its LLM mode and season budget; the Conversation review tab holds only its
 * provider, since the judge's cap is edited in the Conversation review section.
 */
export function LLMProviderPanel({ purpose, stored, state, editing, disabled, onReenter = () => {}, extra }: LLMProviderPanelProps) {
  return (
    <>
      {purpose === "wrapped" && <p className="text-label text-muted-foreground">Set the LLM mode and season budget on the Rewind settings tab.</p>}
      {editing ? (
        <LLMProviderFields purpose={purpose} state={state} disabled={disabled} />
      ) : (
        <LLMProviderSummary purpose={purpose} stored={stored} onReenter={onReenter} />
      )}
      {extra && <div className="border-t pt-4">{extra}</div>}
    </>
  )
}
