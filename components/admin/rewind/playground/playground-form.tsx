"use client"

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

import { DEFAULT_MODEL, REPLAY_MODEL, type Effort, type PlaygroundForm as FormState } from "./use-playground"

export interface PlaygroundOptions {
  members: ReadonlyArray<{ id: string; name: string }>
  fixtures: ReadonlyArray<{ id: string; year: number }>
  /** The season a member runs for. */
  memberYear: number
  /** The active Rewind provider row, or null when the server has none (templates only). */
  provider: { provider: string; model: string } | null
  /** Catalogue models on that provider. */
  models: ReadonlyArray<{ id: string; label: string }>
  /** The selected model has recordings a fixture run can replay. */
  replay: boolean
  promptVersions: readonly string[]
  efforts: readonly Effort[]
}

interface Option {
  value: string
  label: string
}

function ChoiceField({ name, label, description, items, value, onChange, disabled }: {
  name: string
  label: string
  description?: ReactNode
  items: readonly Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Field name={name} disabled={disabled}>
      <FieldLabel nativeLabel={false} render={<div />}>
        {label}
      </FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => next !== null && onChange(next)} disabled={disabled}>
        <SelectTrigger aria-label={label} data-testid={`playground-${name}-trigger`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`playground-${name}-option-${item.value}`}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

interface PlaygroundFormProps {
  form: FormState
  options: PlaygroundOptions
  busy: boolean
  onChange: (patch: Partial<FormState>) => void
  onRun: () => void
}

/** The dry run's inputs (design 10.2): subject, model, prompt version, effort and copy policy. */
export function PlaygroundForm({ form, options, busy, onChange, onRun }: PlaygroundFormProps) {
  const providerDefault = options.provider ? `Provider default (${options.provider.model})` : "Provider default"
  const models: Option[] = [
    { value: DEFAULT_MODEL, label: providerDefault },
    ...options.models.filter((m) => m.id !== options.provider?.model).map((m) => ({ value: m.id, label: m.label })),
    ...(options.replay && form.subject === "fixture" ? [{ value: REPLAY_MODEL, label: "Selected model, recorded answers" }] : []),
  ]
  const templatesOnly = form.copyPolicy === "no-llm"
  const missingSubject = form.subject === "fixture" ? !form.fixtureId : !form.userId

  return (
    <form
      className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:p-6"
      data-testid="playground-form"
      onSubmit={(event) => {
        event.preventDefault()
        onRun()
      }}
    >
      <div className="flex flex-col gap-2">
        <span id="playground-subject-label" className="text-label font-medium text-foreground">
          Run on
        </span>
        <SegmentedControl
          aria-labelledby="playground-subject-label"
          value={form.subject}
          onValueChange={(value) => onChange({ subject: value === "member" ? "member" : "fixture" })}
          disabled={busy}
        >
          <Segment value="fixture" data-testid="playground-subject-fixture">
            Golden fixture
          </Segment>
          <Segment value="member" data-testid="playground-subject-member">
            Member
          </Segment>
        </SegmentedControl>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {form.subject === "fixture" ? (
          <ChoiceField
            name="fixture"
            label="Fixture"
            items={options.fixtures.map((f) => ({ value: f.id, label: `${f.id} (${f.year})` }))}
            value={form.fixtureId}
            onChange={(fixtureId) => onChange({ fixtureId })}
            disabled={busy}
          />
        ) : (
          <ChoiceField
            name="member"
            label="Member"
            description={`Runs on their ${options.memberYear} history.`}
            items={options.members.map((m) => ({ value: m.id, label: m.name }))}
            value={form.userId}
            onChange={(userId) => onChange({ userId })}
            disabled={busy}
          />
        )}
        <ChoiceField
          name="copy-policy"
          label="Copy"
          items={[
            { value: "default", label: options.provider ? "AI copy, templates as fallback" : "Templates (no provider)" },
            { value: "no-llm", label: "Templates only" },
          ]}
          value={form.copyPolicy}
          onChange={(value) => onChange({ copyPolicy: value === "no-llm" ? "no-llm" : "default" })}
          disabled={busy}
        />
        <ChoiceField name="model" label="Model" items={models} value={form.model} onChange={(model) => onChange({ model })} disabled={busy || templatesOnly} />
        <ChoiceField
          name="effort"
          label="Effort"
          items={options.efforts.map((e) => ({ value: e, label: e }))}
          value={form.effort}
          onChange={(value) => onChange({ effort: options.efforts.find((e) => e === value) ?? form.effort })}
          disabled={busy || templatesOnly}
        />
        <ChoiceField
          name="prompt-version"
          label="Prompt version"
          items={options.promptVersions.map((v) => ({ value: v, label: v }))}
          value={form.promptVersion}
          onChange={(promptVersion) => onChange({ promptVersion })}
          disabled={busy || templatesOnly}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || missingSubject} data-testid="playground-run">
          {busy && <Spinner />}
          {busy ? "Running" : "Run dry run"}
        </Button>
        <p className="text-label text-muted-foreground">Dry runs don&apos;t change any member&apos;s Rewind.</p>
      </div>
    </form>
  )
}
