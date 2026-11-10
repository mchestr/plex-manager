"use client"

import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { sameJson } from "@/lib/cleanup/editor/stable-json"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { isRecord } from "@/lib/cleanup/fields/values"

import { editorId, kebab, type ValueEditorProps } from "./editor-parts"

/** A choice's value as a key, in kebab case: `neverPlayed` gives `never-played`, `false` gives `false`. */
const choiceKey = (value: unknown) => kebab(String(value)).toLowerCase()

/**
 * The value of a field with a few named values (UX 6): Requested in
 * Overseerr (Yes, No), The requesters (never played it, all finished it) and
 * Show status (Ended, Continuing), as a `RadioGroup` named by the Value
 * heading. A choice sends the change at once. Each radio's test id is its
 * value in kebab case (`-choice-never-played`, `-choice-false`, UX 10.2).
 */
export function ChoiceValue({ condition, level, onChange, labelId }: ValueEditorProps) {
  const meta = anyFieldMeta(condition.field)
  const choices = meta.choices ?? []
  // The one key of the value object: `exists`, `did` or `status`.
  const key = Object.keys(meta.defaultCondition(level).value)[0]
  const current = isRecord(condition.value) ? condition.value[key] : undefined
  const checked = choices.find((choice) => sameJson(choice.value, current))

  return (
    <RadioGroup<string>
      aria-labelledby={labelId}
      value={checked ? choiceKey(checked.value) : null}
      onValueChange={(next) => {
        const choice = choices.find((c) => choiceKey(c.value) === next)
        if (choice) onChange({ ...condition, value: { [key]: choice.value } }, "now")
      }}
      data-testid={editorId("choices")}
      className="gap-0.5"
    >
      {choices.map((choice) => (
        <RadioCard
          key={choice.label}
          value={choiceKey(choice.value)}
          data-testid={editorId(`choice-${choiceKey(choice.value)}`)}
          className="items-center rounded-md border-transparent bg-transparent px-2 py-1.5 hover:border-transparent hover:bg-accent data-checked:border-transparent"
        >
          <span className="text-ui text-foreground">{choice.label}</span>
        </RadioCard>
      ))}
    </RadioGroup>
  )
}
