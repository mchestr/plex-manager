"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent, type KeyboardEvent } from "react"

import { createPromptTemplate, updatePromptTemplate } from "@/actions/prompts"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { usePromptEditor, type PromptEditorStatus, type PromptEditorValues } from "@/hooks/admin/use-prompt-editor"
import { useUndoRedo } from "@/hooks/admin/use-undo-redo"
import { newStyleGuide, promptDetail } from "@/lib/admin/routes"
import { styleGuideFieldErrors, type StyleGuideField } from "@/lib/validations/prompt"

import { EditorToolbar } from "./editor-toolbar"
import { PromptDetailsFields } from "./prompt-details-fields"
import { PromptPreview } from "./prompt-preview"
import { StyleGuideField as StyleGuideTextField } from "./style-guide-field"

interface EditablePrompt {
  id: string
  name: string
  description: string | null
  template: string
  isActive: boolean
  kind: string
}

interface PromptEditorProps {
  /** The row being edited; absent for a new style guide. */
  prompt?: EditablePrompt
  /** A new style guide's starting values, such as text copied from a v2 template. */
  initial?: Partial<PromptEditorValues>
  cancelHref: Route
}

const STATUS_TEXT: Record<PromptEditorStatus, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving",
  saved: "Saved",
  error: "",
}

/** Errors that show as you type; the rest wait for a save attempt. */
const LIVE: readonly StyleGuideField[] = ["template"]

/**
 * The style-guide editor (P10.4): details, the text with Undo and Redo, and
 * the assembled prompt. A v2 template opens read-only with a way to copy it.
 */
export function PromptEditor({ prompt, initial, cancelHref }: PromptEditorProps) {
  const router = useRouter()
  const toast = useToast()
  const readOnly = prompt !== undefined && prompt.kind !== "rewind-style-guide"

  const opened: PromptEditorValues = {
    name: prompt?.name ?? initial?.name ?? "",
    description: prompt?.description ?? initial?.description ?? "",
    template: prompt?.template ?? initial?.template ?? "",
    isActive: prompt?.isActive ?? initial?.isActive ?? false,
  }
  const [details, setDetails] = useState({ name: opened.name, description: opened.description, isActive: opened.isActive })
  const text = useUndoRedo(opened.template)
  const [attempted, setAttempted] = useState(false)
  const values: PromptEditorValues = { ...details, template: text.value }

  const editor = usePromptEditor({
    // A copied template starts unsaved, so leaving warns
    initial: prompt ? opened : { name: "", description: "", template: "", isActive: false },
    values,
    save: (v) => (prompt ? updatePromptTemplate({ id: prompt.id, ...v }) : createPromptTemplate(v)),
    onSaved: (id, saved) => {
      text.reset(saved.template)
      toast.showSuccess(`Saved ${saved.name}`)
      router.push(promptDetail(id))
    },
  })

  const clientErrors = styleGuideFieldErrors(values)
  const errorFor = (field: StyleGuideField) =>
    editor.fieldErrors[field]?.[0] ??
    (attempted || (LIVE.includes(field) && text.value.length > 0) ? clientErrors[field] : undefined)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (Object.keys(clientErrors).length === 0) editor.submit()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === "z" && !event.shiftKey) {
      event.preventDefault()
      text.undo()
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault()
      text.redo()
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8" data-testid="admin-prompt-editor">
      {readOnly && prompt && (
        <Alert
          tone="info"
          title="Read-only"
          action={
            <Button data-testid="admin-prompt-editor-new-style-guide" variant="secondary" size="sm" nativeButton={false} render={<Link href={newStyleGuide(prompt.id)} />}>
              Copy into a new style guide
            </Button>
          }
          data-testid="admin-prompt-editor-v2-notice"
        >
          This is a v2 template. Rewind 2026 only appends a style guide, so this text isn&apos;t used.
        </Alert>
      )}
      <PromptDetailsFields
        {...details}
        onChange={(patch) => setDetails((current) => ({ ...current, ...patch }))}
        errors={{ name: errorFor("name"), description: errorFor("description") }}
        readOnly={readOnly}
      />
      <div className="flex flex-col gap-3">
        {!readOnly && <EditorToolbar canUndo={text.canUndo} canRedo={text.canRedo} onUndo={text.undo} onRedo={text.redo} />}
        <StyleGuideTextField
          value={text.value}
          onChange={text.set}
          onKeyDown={onKeyDown}
          error={readOnly ? undefined : errorFor("template")}
          readOnly={readOnly}
        />
      </div>
      {!readOnly && <PromptPreview styleGuide={text.value} />}
      {editor.error && <Alert tone="destructive">{editor.error}</Alert>}
      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
        <span aria-live="polite" className="mr-auto text-label text-muted-foreground" data-testid="admin-prompt-editor-status">
          {STATUS_TEXT[editor.status]}
        </span>
        <Button data-testid="admin-prompt-editor-cancel" variant="secondary" nativeButton={false} render={<Link href={cancelHref} />}>
          {readOnly ? "Back" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button type="submit" loading={editor.status === "saving"} loadingLabel="Saving" data-testid="admin-prompt-editor-save">
            Save
          </Button>
        )}
      </footer>
    </form>
  )
}
