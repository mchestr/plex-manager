"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useRef, useState } from "react"

import { ConditionEditor } from "@/components/admin/cleanup/editor/condition-editor/condition-editor"
import type { ConditionEditorFocus } from "@/components/admin/cleanup/editor/condition-editor/editor-parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Combobox, type ComboboxGroup } from "@/components/ui/combobox"
import { DataTableBulkBar } from "@/components/ui/data-table/bulk-bar"
import { DataTable } from "@/components/ui/data-table/data-table"
import { Fieldset } from "@/components/ui/fieldset"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Token, type TokenPart, type TokenState } from "@/components/ui/token"
import { ValueHistogram } from "@/components/ui/value-histogram"
import { editorFocusPart } from "@/lib/cleanup/editor/focus"
import { draftRowParts } from "@/lib/cleanup/fields/sentence"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"

import { Row, Specimen } from "./specimen"

// Invented fixtures: no real member, title or server.
const TOKENS: { state: TokenState; part: TokenPart; text: string; sourceName?: string; partLabel?: string }[] = [
  { state: "default", part: "field", text: "Last played" },
  { state: "open", part: "operator", text: "more than" },
  { state: "changed", part: "value", text: "180 days" },
  { state: "error", part: "value", text: "0 days" },
  { state: "notApplicable", part: "field", text: "Show status" },
  { state: "incomplete", part: "value", text: "Enter a size" },
  { state: "sourceFailed", part: "field", text: "Last played", sourceName: "Tautulli" },
  { state: "readOnly", part: "field", text: "Movies", partLabel: "level" },
  { state: "static", part: "value", text: "365 days" },
]

const BUCKETS = [
  { label: "Last 30 days", count: 54, passes: false },
  { label: "1 to 3 months", count: 61, passes: false },
  { label: "3 to 6 months", count: 72, passes: false },
  { label: "6 to 12 months", count: 112, passes: false },
  { label: "1 to 2 years", count: 166, passes: true },
  { label: "2 years or more", count: 162, passes: true },
  { label: "Never", count: 150, passes: true },
]
const SUMMARY = "478 of 777 movies pass this condition."

const FOCUS: ConditionEditorFocus = {
  matches: 197,
  historyStart: "2022-06-14",
  zone: "UTC",
  data: {
    presets: [
      { value: { amount: 90, unit: "days" }, label: "90 days", matches: 268 },
      { value: { amount: 180, unit: "days" }, label: "180 days", matches: 231 },
      { value: { amount: 365, unit: "days" }, label: "365 days", matches: 197 },
      { value: { amount: 2, unit: "years" }, label: "2 years", matches: 158 },
    ],
    buckets: BUCKETS,
    summary: SUMMARY,
    computedDate: "Played before Nov 8, 2025, server time (UTC).",
  },
}
const SOURCES: SourceStatus[] = [{ service: "sonarr", state: "notConfigured", readAt: null }]
const MEMBERS: RequesterOption[] = [
  { userId: "u-robin", name: "Robin Vale", status: "former", requests: 47 },
  { userId: "u-sky", name: "Sky Moreno", status: "member", requests: 31 },
]
const START: DraftCondition = { id: "c2", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } }

type Requester = { id: string; name: string }
const REQUESTERS: ComboboxGroup<Requester>[] = [
  { label: "Special", items: [{ id: "any-member", name: "Any member" }, { id: "former", name: "Former members" }] },
  { label: "Members who made requests", items: MEMBERS.map((m) => ({ id: m.userId, name: m.name })) },
]

interface Season {
  id: string
  title: string
  leaveOn: string
  size: string
}
const SEASONS: Season[] = [
  { id: "s1", title: "Harbour Lights, Season 2", leaveOn: "Nov 19", size: "38 GB" },
  { id: "s2", title: "Harbour Lights, Season 3", leaveOn: "Nov 19", size: "33 GB" },
  { id: "s3", title: "The Long Field, Season 1", leaveOn: "Nov 20", size: "21 GB" },
]
const seasonColumns: ColumnDef<Season>[] = [
  { id: "title", header: "Title", accessorKey: "title", meta: { card: "title" } },
  { id: "size", header: "Size", accessorKey: "size", meta: { align: "end", card: "field" } },
]

/** Every token state of UX 4.12.1. */
function TokenSpecimen() {
  return (
    <Specimen id="token" title="Token">
      {TOKENS.map(({ state, part, text, sourceName, partLabel }) => (
        <Row key={state} label={state}>
          <Token part={part} state={state} sourceName={sourceName} partLabel={partLabel} data-testid={`dev-ui-token-${state}`}>
            {text}
          </Token>
        </Row>
      ))}
    </Specimen>
  )
}

/** A condition row whose tokens open the condition editor at their part (UX 4.4): a Popover from md, a Sheet below. */
function ConditionEditorSpecimen() {
  const [condition, setCondition] = useState(START)
  const [opened, setOpened] = useState<"field" | "operator" | "value" | null>(null)
  const field = useRef<HTMLButtonElement>(null)
  const operator = useRef<HTMLButtonElement>(null)
  const value = useRef<HTMLButtonElement>(null)
  const anchors = { field, operator, value }
  const close = () => setOpened(null)
  return (
    <Specimen id="condition-editor" title="Condition editor">
      <div className="flex flex-wrap items-center gap-1.5 text-ui" data-testid="dev-ui-condition-editor-row">
        {draftRowParts(condition, "movie").parts.map((part, index) =>
          part.kind === "text" ? (
            <span key={index}>{part.text}</span>
          ) : (
            <Token
              key={index}
              ref={anchors[part.kind]}
              part={part.kind}
              state={opened === part.kind ? "open" : "default"}
              onClick={() => setOpened(part.kind)}
              data-testid={`dev-ui-condition-editor-${part.kind}`}
            >
              {part.text}
            </Token>
          )
        )}
      </div>
      <ConditionEditor
        open={opened !== null}
        anchor={anchors[opened ?? "value"]}
        condition={condition}
        conditionRole="condition"
        index={2}
        total={3}
        level="movie"
        focusPart={editorFocusPart(condition, opened ?? "value")}
        focus={FOCUS}
        requesterOptions={MEMBERS}
        sources={SOURCES}
        onDraftChange={() => {}}
        onDone={(next) => {
          setCondition(next)
          close()
        }}
        onCancel={close}
        onRemove={close}
      />
    </Specimen>
  )
}

/** ChoiceChips, NumberField, Combobox, Fieldset and ValueHistogram (UX 4.12.3 to 4.12.7). */
function InputSpecimens() {
  const [grace, setGrace] = useState<string>("30")
  const [other, setOther] = useState<number | null>(45)
  const [days, setDays] = useState<number | null>(90)
  const [requesters, setRequesters] = useState<Requester[]>([REQUESTERS[0].items[1]])
  return (
    <>
      <Specimen id="choice-chips" title="ChoiceChips">
        <p id="dev-ui-choice-chips-label" className="text-label text-muted-foreground">
          Grace period
        </p>
        <ChoiceChips
          aria-labelledby="dev-ui-choice-chips-label"
          value={grace === "other" ? null : grace}
          onValueChange={setGrace}
          options={[
            { value: "14", label: "14 days", count: 12 },
            { value: "30", label: "30 days", count: 197 },
            { value: "60", label: "60 days", count: null, disabled: true },
          ]}
          other={{ label: "Other", checked: grace === "other", onSelect: () => setGrace("other"), unit: "days", value: other, onValueChange: setOther }}
          data-testid="dev-ui-choice-chips-grace"
        />
      </Specimen>
      <Specimen id="number-field" title="NumberField">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dev-ui-number-field-days">Inactive for (days)</Label>
          <NumberField id="dev-ui-number-field-days" value={days} onValueChange={setDays} min={1} data-testid="dev-ui-number-field-days" />
        </div>
      </Specimen>
      <Specimen id="combobox" title="Combobox">
        <Combobox<Requester>
          groups={REQUESTERS}
          value={requesters}
          onValueChange={setRequesters}
          getLabel={(item) => item.name}
          getKey={(item) => item.id}
          placeholder="Find a member"
          aria-label="Requested by"
          className="max-w-md"
          data-testid="dev-ui-combobox-requesters"
        />
      </Specimen>
      <Specimen id="fieldset" title="Fieldset">
        <Fieldset legend="Find movies where all of these are true" note="Order does not matter.">
          <p className="text-ui text-muted-foreground">The condition rows sit here.</p>
        </Fieldset>
      </Specimen>
      <Specimen id="value-histogram" title="ValueHistogram">
        <ValueHistogram buckets={BUCKETS} summary={SUMMARY} aria-label="Movies by last play" className="max-w-md" data-testid="dev-ui-value-histogram-chart" />
      </Specimen>
    </>
  )
}

/** Collapsible, the indeterminate Checkbox, and DataTable selection, group rows and the bulk bar (UX 4.12.4). */
function SelectionSpecimens() {
  const [selected, setSelected] = useState<string[]>(["s1"])
  return (
    <>
      <Specimen id="collapsible" title="Collapsible">
        <Collapsible>
          <p className="text-ui text-muted-foreground">Always on: 10 global protections keep 17 movies safe.</p>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" data-testid="dev-ui-collapsible-trigger" />}>Show each</CollapsibleTrigger>
          <CollapsiblePanel>
            <p className="pt-2 text-ui">Played in the last 30 days: 4</p>
          </CollapsiblePanel>
        </Collapsible>
      </Specimen>
      <Specimen id="table-selection" title="DataTable selection and group rows">
        <Row label="Indeterminate">
          <Checkbox aria-label="Some rows selected" indeterminate data-testid="dev-ui-checkbox-indeterminate" />
        </Row>
        <DataTable
          columns={seasonColumns}
          data={SEASONS}
          getRowId={(row) => row.id}
          label="Leaving soon"
          noun="seasons"
          pagination={{ page: 1, pageSize: 25, total: SEASONS.length }}
          empty={null}
          selectable={{ selected, onSelectedChange: setSelected, getRowLabel: (row) => row.title }}
          groupBy={{ getGroupKey: (row) => row.leaveOn, renderHeader: (key, rows) => `${key}: ${rows.length} ${rows.length === 1 ? "season" : "seasons"}` }}
          bulkBar={<DataTableBulkBar count={selected.length} label="up to 38 GB" onClear={() => setSelected([])} data-testid="dev-ui-table-selection-bulk" />}
          size="narrow"
          data-testid="dev-ui-table-selection-table"
        />
      </Specimen>
    </>
  )
}

/** The media cleanup primitives and the condition editor (TS 12.4), with invented data. */
export function CleanupPrimitivesSpecimen() {
  return (
    <>
      <TokenSpecimen />
      <ConditionEditorSpecimen />
      <InputSpecimens />
      <SelectionSpecimens />
    </>
  )
}
