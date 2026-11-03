"use client"

import { useId, useState } from "react"

import { deleteSkillSource, saveSkillSource } from "@/actions/admin/assistant-skills"
import { SheetForm, type SheetFormControls } from "@/components/admin/settings/sheet-form"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SecretInput } from "@/components/ui/secret-input"
import { SettingsFormFooter } from "@/components/ui/settings-form-footer"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { SkillSourceSettings } from "@/lib/data/assistant-sources"

type Errors = Partial<Record<"name" | "repo" | "ref" | "path", string>>

/**
 * One GitHub repository of Agent Skills (`SKILL.md` folders) the assistant
 * lists and follows: the edit mode of its row, in a Sheet. It mirrors the
 * knowledge base form, but a save reads nothing from GitHub (the row's Check
 * skills does), and the ref field says how far each kind of ref can move.
 */
export function SkillSourceForm({ source, onDone, onCancel, onDirtyChange, onPendingChange }: { source: SkillSourceSettings | null } & SheetFormControls) {
  const toast = useToast()
  const activeId = useId()
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
      const result = await saveSkillSource({ ...(source ? { id: source.id } : {}), ...current })
      if (!result.success) {
        const field = (key: keyof Errors) => result.fieldErrors?.[key]?.[0]
        setErrors({ name: field("name"), repo: field("repo"), ref: field("ref"), path: field("path") })
        toast.showError(result.error)
        return { ok: false }
      }
      setErrors({})
      toast.showSuccess("Skill source saved")
      return { ok: true, keep: { ...current, token: "" } }
    }
  )

  return (
    <SheetForm form={form} onDone={onDone} onDirtyChange={onDirtyChange} onPendingChange={onPendingChange} data-testid="settings-skill-form">
      <div className="grid grid-cols-1 gap-4">
        <FormField name="skill-name" label="Name" error={errors.name}>
          <Input value={values.name} onValueChange={(name) => set({ name })} placeholder="Ops" required disabled={form.isPending} data-testid="settings-skill-name" />
        </FormField>
        <FormField name="skill-repo" label="GitHub repository" error={errors.repo}>
          <Input value={values.repo} onValueChange={(repo) => set({ repo })} placeholder="mchestr/skills" required disabled={form.isPending} data-testid="settings-skill-repo" />
        </FormField>
        <FormField
          name="skill-ref"
          label="Commit, tag or branch"
          description="A commit keeps the skills fixed until you change it. A tag changes only if someone moves it; a branch changes whenever anyone pushes to it."
          error={errors.ref}
        >
          <Input value={values.ref} onValueChange={(ref) => set({ ref })} placeholder="v1.0.0" required disabled={form.isPending} data-testid="settings-skill-ref" />
        </FormField>
        <FormField name="skill-path" label="Folder" optional description="Leave empty to use the whole repository." error={errors.path}>
          <Input value={values.path} onValueChange={(path) => set({ path })} placeholder="skills" disabled={form.isPending} data-testid="settings-skill-path" />
        </FormField>
        <FormField name="skill-token" label="GitHub token" optional description="Needed for a private repository, and recommended for a branch.">
          <SecretInput value={values.token} onValueChange={(token) => set({ token })} saved={source?.token} noun="token" disabled={form.isPending} data-testid="settings-skill-token" />
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox id={activeId} checked={values.isActive} onCheckedChange={(isActive) => set({ isActive })} disabled={form.isPending} data-testid="settings-skill-active" />
          <Label htmlFor={activeId}>Use this skill source</Label>
        </div>
      </div>
      <SettingsFormFooter id="skill" title={source?.name ?? "the new skill source"} form={form} editing onCancel={onCancel} className="px-0" />
      {source && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" size="sm" data-testid="settings-skill-delete">
              Remove skill source
            </Button>
          }
          title={`Remove ${source.name}?`}
          description="The assistant stops following its skills. The repository does not change."
          confirmLabel="Remove"
          pendingLabel="Removing"
          tone="destructive"
          data-testid="settings-skill-remove"
          confirmTestId="settings-skill-remove-confirm"
          action={async () => {
            const result = await deleteSkillSource({ id: source.id })
            if (!result.success) return { error: result.error }
            onDone?.()
            return {}
          }}
        />
      )}
    </SheetForm>
  )
}
