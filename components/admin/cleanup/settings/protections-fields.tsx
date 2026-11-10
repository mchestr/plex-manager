"use client"

import { type ReactNode, useId } from "react"

import { countWords, fieldId, G10_WARNING, ROWS, rowName, slug, watchlistHint } from "@/components/admin/cleanup/settings/protection-rows"
import {
  addCollections,
  daysError,
  isLocked,
  type OptionId,
  type ProtectionsDraft,
  REQUESTER_TAG,
} from "@/components/admin/cleanup/settings/protections-draft"
import { ChangedFrom, daysText, onOffWord } from "@/components/admin/cleanup/settings/section-parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { joinAnd } from "@/lib/cleanup/fields/words"
import { seasonalName } from "@/lib/cleanup/preview/protection-words"
import type { SettingsProtection } from "@/lib/cleanup/types/list-parts"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"

interface FieldsProps {
  data: CleanupSettingsData
  draft: ProtectionsDraft
  saved: ProtectionsOptions
  /** Changes one protection of the draft. */
  change: <K extends OptionId>(id: K, patch: Partial<ProtectionsDraft[K]>) => void
  /** Replaces the draft of G13 ("Add both"). */
  replace: (next: ProtectionsDraft) => void
  /** "Protects N" for the draft: the settled preview, else the saved counts. */
  protects: (id: GlobalProtectionId) => number | null
  errors: Partial<Record<string, string>>
  disabled: boolean
}

interface RowProps extends FieldsProps {
  protection: SettingsProtection
}

/** The inline control of a row: its days field, the G9 tag picker or the G13 collection picker. */
function InlineControl({ protection, draft, saved, change, errors, disabled, data }: RowProps) {
  const id = protection.id
  const words = id === "g10" ? null : ROWS[id]
  if (words?.days) {
    const days = words.days.id
    const error = errors[`${days}-days`] ?? daysError(draft[days].days)
    const changed = draft[days].days !== saved[days].days
    return (
      <NumberField
        aria-label={`Days for: ${words.days.name}`}
        aria-describedby={[changed ? fieldId(id, "days-changed") : null, error ? fieldId(id, "days-error") : null].filter(Boolean).join(" ") || undefined}
        value={draft[days].days}
        min={1}
        max={3650}
        invalid={Boolean(error)}
        disabled={disabled}
        onValueChange={(next) => change(days, { days: next })}
        data-testid={fieldId(id, "days")}
      />
    )
  }
  if (id === "g9") {
    return (
      <Combobox
        items={data.tagOptions.filter((tag) => !REQUESTER_TAG.test(tag))}
        value={draft.g9.tags}
        onValueChange={(tags) => change("g9", { tags })}
        getLabel={(tag) => tag}
        getKey={slug}
        placeholder="Add a tag"
        emptyText="No other tag in Radarr or Sonarr"
        disabled={disabled}
        invalid={Boolean(errors["g9-tags"])}
        aria-label="Radarr or Sonarr tags"
        className="w-60 max-w-full"
        data-testid={fieldId(id, "tags")}
      />
    )
  }
  if (id === "g13") {
    return (
      <Combobox
        items={data.collectionOptions}
        value={draft.g13.collections}
        onValueChange={(collections) => change("g13", { collections })}
        getLabel={(title) => title}
        getKey={slug}
        placeholder="Choose collections"
        emptyText="No collection in Plex"
        disabled={disabled}
        invalid={Boolean(errors["g13-collections"])}
        aria-label="Plex collections"
        className="w-64 max-w-full"
        data-testid={fieldId(id, "collections")}
      />
    )
  }
  return null
}

/** The lines under a row's sentence: its hint, the G10 warning, the Kometa suggestion, what changed and the errors. */
function RowNotes({ protection, draft, saved, errors, replace, data, disabled }: RowProps) {
  const id = protection.id
  const notes: ReactNode[] = []
  const words = id === "g10" ? null : ROWS[id]
  if (words?.days) {
    const days = words.days.id
    const error = errors[`${days}-days`] ?? daysError(draft[days].days)
    if (draft[days].days !== saved[days].days) {
      notes.push(
        <span key="changed" className="flex flex-wrap gap-x-1">
          <ChangedFrom id={fieldId(id, "days-changed")} value={daysText(saved[days].days)} />
          <span>From 1 to 3650 days.</span>
        </span>
      )
    }
    if (error) notes.push(<span key="error" id={fieldId(id, "days-error")} className="text-destructive" data-testid={fieldId(id, "days-error")}>{error}</span>)
  }
  if (words?.hint && !isLocked(id)) notes.push(<span key="hint">{words.hint}</span>)
  if (id === "g8") notes.push(<span key="hint">{watchlistHint(data.watchlistMembers)}</span>)
  if (id === "g10") notes.push(<span key="hint" className="text-warning">{G10_WARNING}</span>)
  for (const key of ["g9-tags", "g13-collections"] as const) {
    if (key.startsWith(`${id}-`) && errors[key]) notes.push(<span key={key} className="text-destructive">{errors[key]}</span>)
  }
  const suggestion = data.kometaSuggestion
  if (id === "g13" && suggestion && !suggestion.names.every((name) => draft.g13.collections.includes(name))) {
    const names = suggestion.names.map(seasonalName)
    const one = names.length === 1
    notes.push(
      <span key="kometa">
        Kometa makes the {one ? "collection" : "collections"} {joinAnd(names)} in {suggestion.library}. Seasonal titles play once a year.{" "}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-label"
          disabled={disabled}
          onClick={() => replace(addCollections(draft, suggestion.names))}
          data-testid={fieldId(id, "suggest")}
        >
          {one ? "Add it" : names.length === 2 ? "Add both" : `Add all ${names.length}`}
        </Button>
      </span>
    )
  }
  const optionId = isLocked(id) ? null : id
  if (optionId && draft[optionId].enabled !== saved[optionId].enabled) {
    notes.push(<ChangedFrom key="enabled" id={fieldId(id, "enabled-changed")} value={onOffWord(saved[optionId].enabled)} />)
  }
  if (notes.length === 0) return null
  return <div className="flex flex-col gap-0.5 text-label text-muted-foreground">{notes}</div>
}

/** One protection: the checkbox named by the full sentence, the sentence with its inline field, the notes, and the count (UX 4.10 rule 8). */
function ProtectionRow(props: RowProps) {
  const { protection, draft, change, disabled, protects } = props
  const id = protection.id
  const checkboxId = fieldId(id, "enabled")
  const optionId = isLocked(id) ? null : id
  const on = optionId === null || draft[optionId].enabled
  const words = id === "g10" ? { before: protection.sentence, after: undefined } : ROWS[id]
  const count = countWords(protection, on, protects(id))
  return (
    <div className="flex items-start gap-3 border-t py-3" data-testid={fieldId(id, "row")}>
      <Checkbox
        id={checkboxId}
        aria-label={rowName(protection, draft, props.saved)}
        checked={on}
        disabled={optionId === null || disabled}
        onCheckedChange={(next) => {
          if (optionId) change(optionId, { enabled: next })
        }}
        aria-describedby={optionId === null ? fieldId(id, "hint") : undefined}
        // Centred on the first line: a line of text, or the 40px (36px from md) inline field
        className={id === "g9" || id === "g13" || ("days" in words && words.days) ? "mt-3 md:mt-2.5" : "mt-0.5"}
        data-testid={checkboxId}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui font-medium text-foreground">
          <Label htmlFor={checkboxId}>{words.before}</Label>
          <InlineControl {...props} />
          {words.after && <span>{words.after}</span>}
        </div>
        {optionId === null && (
          <span id={fieldId(id, "hint")} className="text-label text-muted-foreground">
            Always on.
          </span>
        )}
        <RowNotes {...props} />
      </div>
      {count && <span className="shrink-0 pt-0.5 text-label text-muted-foreground">{count}</span>}
    </div>
  )
}

/** A labelled group of rows: "Season rules only", "Suggested". */
function RowGroup({ label, children }: { label?: string; children: ReactNode }) {
  const labelId = useId()
  if (!label) return <div>{children}</div>
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col pt-4">
      <p id={labelId} className="pb-2 text-label font-semibold text-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * The Edit rows of Global protections (UX 4.10, `shots/10-settings-protections-editing.png`):
 * G1 and G3 locked with "Always on" (TS E30), then each protection with its
 * inline `NumberField` outside the checkbox label, G9's tag picker without
 * the Overseerr requester tags, G10's warning, the season rules, and G13
 * with the Kometa suggestion.
 */
export function ProtectionsFields(props: FieldsProps) {
  const byId = new Map(props.data.protections.map((p) => [p.id, p]))
  const rows = (ids: readonly GlobalProtectionId[]) =>
    ids.flatMap((id) => {
      const protection = byId.get(id)
      return protection ? [<ProtectionRow key={id} {...props} protection={protection} />] : []
    })
  return (
    <div className="flex flex-col" data-testid="cleanup-protections-fields">
      <RowGroup>{rows(["g1", "g3", "g2", "g4", "g5", "g6", "g7", "g8", "g9", "g10"])}</RowGroup>
      <RowGroup label="Season rules only">{rows(["g11", "g12"])}</RowGroup>
      <RowGroup label={props.data.kometaSuggestion ? "Suggested" : undefined}>{rows(["g13"])}</RowGroup>
    </div>
  )
}
