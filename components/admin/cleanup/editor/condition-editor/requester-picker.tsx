"use client"

import { useId, useMemo } from "react"

import { Combobox, type ComboboxGroup } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { isRecord } from "@/lib/cleanup/fields/values"
import { UNKNOWN_MEMBER } from "@/lib/cleanup/fields/words"
import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import { type RequesterRef, requesterRefSchema } from "@/lib/validations/cleanup-rule"

import { editorId, type ValueEditorProps } from "./editor-parts"

/** One choice of the member list: a special group or a member. `key` makes its test ids. */
interface RequesterItem {
  key: string
  ref: RequesterRef
  label: string
  option?: RequesterOption
}

/** "Members inactive for [90] days" starts at 90 (UX 6). */
const DEFAULT_INACTIVE_DAYS = 90

const SPECIAL: readonly RequesterItem[] = [
  { key: "any-member", ref: { kind: "anyMember" }, label: "Any member" },
  { key: "former", ref: { kind: "former" }, label: "Former members" },
  { key: "inactive", ref: { kind: "inactive", days: DEFAULT_INACTIVE_DAYS }, label: "Members inactive for..." },
]

const memberItem = (option: RequesterOption): RequesterItem => ({
  key: option.userId,
  ref: { kind: "member", userId: option.userId },
  label: option.name,
  option,
})

/** The chips of the stored refs, in their order. A member with no option reads "Unknown member" (X8). */
function itemsOf(refs: readonly RequesterRef[], options: readonly RequesterOption[]): RequesterItem[] {
  return refs.map((ref) => {
    switch (ref.kind) {
      case "anyMember":
        return SPECIAL[0]
      case "former":
        return SPECIAL[1]
      case "inactive":
        return { key: "inactive", ref, label: Number.isInteger(ref.days) ? `Members inactive for ${ref.days} days` : SPECIAL[2].label }
      case "member": {
        const option = options.find((o) => o.userId === ref.userId)
        return option ? memberItem(option) : { key: ref.userId, ref, label: UNKNOWN_MEMBER }
      }
    }
  })
}

/** The refs of a draft value: the valid ones, and an inactive ref whose days are being typed. */
function refsOf(value: unknown): RequesterRef[] {
  const list = isRecord(value) && Array.isArray(value.requesters) ? value.requesters : []
  return list.flatMap((ref: unknown): RequesterRef[] => {
    const parsed = requesterRefSchema.safeParse(ref)
    if (parsed.success) return [parsed.data]
    // An inactive ref whose days are being typed stays, so its days input stays open.
    return isRecord(ref) && ref.kind === "inactive" ? [{ kind: "inactive", days: Number.NaN }] : []
  })
}

function MemberRow({ item }: { item: RequesterItem }) {
  if (item.key === "inactive") return <span>Members inactive for...</span>
  const { option } = item
  return (
    <>
      <span className="truncate">{item.label}</span>
      {option && (
        <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
          {option.requests === 1 ? "1 request" : `${option.requests} requests`}
          {option.status === "former" && ", former member"}
        </span>
      )}
    </>
  )
}

/**
 * The value of Requested by (UX 6, UX 8.4): a member `Combobox` with chips.
 * "Special" holds Any member, Former members and "Members inactive for...",
 * a plain option. While that one is chosen, a `NumberField` "Inactive for
 * (days)" shows below the combobox, outside its popup (`-inactive-days`).
 * "Members who made requests" lists members with their request count.
 */
export function RequesterPicker({ condition, onChange, error, errorId, requesterOptions }: ValueEditorProps) {
  const daysId = useId()
  const value = isRecord(condition.value) ? condition.value : {}
  const refs = refsOf(value)
  const inactive = refs.find((ref) => ref.kind === "inactive")
  const days = inactive && Number.isInteger(inactive.days) ? inactive.days : null

  const groups = useMemo<ComboboxGroup<RequesterItem>[]>(() => {
    const members = requesterOptions.map(memberItem)
    return [{ label: "Special", items: SPECIAL }, ...(members.length > 0 ? [{ label: "Members who made requests", items: members }] : [])]
  }, [requesterOptions])

  const setRefs = (next: RequesterRef[], mode: "now" | "typed" | "commit") =>
    onChange({ ...condition, value: { ...value, requesters: next } }, mode)

  const setDays = (next: number | null, mode: "typed" | "commit") =>
    setRefs(
      refs.map((ref) => (ref.kind === "inactive" ? { kind: "inactive", days: next ?? Number.NaN } : ref)),
      mode
    )

  const describedBy = error === null ? undefined : errorId
  // The list's errors ask to pick; the days input's error asks for a number.
  const daysBad = error !== null && inactive !== undefined && error.startsWith("Enter")

  return (
    <>
      <Combobox<RequesterItem>
        groups={groups}
        value={itemsOf(refs, requesterOptions)}
        onValueChange={(items) => setRefs(items.map((item) => item.ref), "now")}
        getLabel={(item) => item.label}
        getKey={(item) => item.key}
        renderItem={(item) => <MemberRow item={item} />}
        placeholder="Find a member"
        emptyText="No member has that name"
        aria-label="Members or groups"
        aria-describedby={daysBad ? undefined : describedBy}
        invalid={error !== null && !daysBad}
        data-testid={editorId("list")}
      />
      {inactive && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={daysId}>Inactive for (days)</Label>
          <NumberField
            id={daysId}
            aria-describedby={daysBad ? describedBy : undefined}
            invalid={daysBad}
            value={days}
            min={1}
            onValueChange={(next) => setDays(next, "typed")}
            onValueCommitted={(next) => setDays(next, "commit")}
            data-testid={editorId("inactive-days")}
          />
        </div>
      )}
    </>
  )
}
