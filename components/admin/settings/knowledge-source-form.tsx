"use client"

import { useState } from "react"

import { deleteKnowledgeSource, saveKnowledgeSource } from "@/actions/admin/assistant-sources"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { SettingsFormFooter } from "@/components/ui/settings-section"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { KnowledgeSourceSettings } from "@/lib/data/assistant-sources"

type Errors = Partial<Record<"name" | "repo" | "ref" | "path", string>>

/** One GitHub repository of Markdown the assistant searches and cites. */
export function KnowledgeSourceForm({ source, onDone }: { source: KnowledgeSourceSettings | null; onDone?: () => void }) {
  const toast = useToast()
  const [errors, setErrors] = useState<Errors>({})

  const { values, set, form } = useSettingsForm(
    {
      name: source?.name ?? "",
      repo: source?.repo ?? "",
      ref: source?.ref ?? "main",
      path: source?.path ?? "",
      token: "",
      isActive: source?.isActive ?? true,
    },
    async (current) => {
      const result = await saveKnowledgeSource({ ...(source ? { id: source.id } : {}), ...current })
      if (!result.success) {
        const field = (key: keyof Errors) => result.fieldErrors?.[key]?.[0]
        setErrors({ name: field("name"), repo: field("repo"), ref: field("ref"), path: field("path") })
        toast.showError(result.error)
        return
      }
      setErrors({})
      const { docCount } = result.data
      if (docCount === null) toast.showError("Saved, but GitHub could not be read. Check the repository, branch and token.")
      else toast.showSuccess(`Knowledge base saved: ${docCount} documents found`)
      onDone?.()
      return { ...current, token: "" }
    }
  )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (form.isDirty) form.onSave()
      }}
      noValidate
      className="flex flex-col gap-6"
      data-testid="settings-knowledge-form"
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField name="kb-name" label="Name" error={errors.name}>
          <Input value={values.name} onValueChange={(name) => set({ name })} placeholder="Runbooks" required disabled={form.isPending} data-testid="settings-knowledge-name" />
        </FormField>
        <FormField name="kb-repo" label="GitHub repository" error={errors.repo}>
          <Input value={values.repo} onValueChange={(repo) => set({ repo })} placeholder="mchestr/knowledgebase" required disabled={form.isPending} data-testid="settings-knowledge-repo" />
        </FormField>
        <FormField name="kb-ref" label="Branch or tag" error={errors.ref}>
          <Input value={values.ref} onValueChange={(ref) => set({ ref })} placeholder="main" required disabled={form.isPending} data-testid="settings-knowledge-ref" />
        </FormField>
        <FormField name="kb-path" label="Folder" optional description="Only Markdown files under it. Leave empty for the whole repository." error={errors.path}>
          <Input value={values.path} onValueChange={(path) => set({ path })} placeholder="docs" disabled={form.isPending} data-testid="settings-knowledge-path" />
        </FormField>
        <FormField name="kb-token" label="GitHub token" optional description="Only for a private repository. Sent to api.github.com only.">
          <SecretInput value={values.token} onValueChange={(token) => set({ token })} saved={source?.token} noun="token" disabled={form.isPending} data-testid="settings-knowledge-token" />
        </FormField>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="kb-active" className="text-ui text-foreground">Use this knowledge base</label>
          <Switch id="kb-active" checked={values.isActive} onCheckedChange={(isActive) => set({ isActive })} disabled={form.isPending} data-testid="settings-knowledge-active" />
        </div>
      </div>
      <SettingsFormFooter id="knowledge" form={form} className="px-0" />
      {source && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" size="sm" data-testid="settings-knowledge-delete">
              Remove knowledge base
            </Button>
          }
          title={`Remove ${source.name}?`}
          description="The assistant stops searching it. The repository is not touched."
          confirmLabel="Remove"
          pendingLabel="Removing"
          tone="destructive"
          data-testid="settings-knowledge-remove"
          confirmTestId="settings-knowledge-remove-confirm"
          action={async () => {
            const result = await deleteKnowledgeSource({ id: source.id })
            if (!result.success) return { error: result.error }
            onDone?.()
            return {}
          }}
        />
      )}
    </form>
  )
}
