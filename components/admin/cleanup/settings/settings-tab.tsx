"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { BudgetSection } from "@/components/admin/cleanup/settings/budget-section"
import { DefaultsSection } from "@/components/admin/cleanup/settings/defaults-section"
import { FeatureSection } from "@/components/admin/cleanup/settings/feature-section"
import { MembersSection } from "@/components/admin/cleanup/settings/members-section"
import { PlexSection } from "@/components/admin/cleanup/settings/plex-section"
import { ProtectionsSection } from "@/components/admin/cleanup/settings/protections-section"
import { SettingsEditProvider, useSectionEditing } from "@/components/ui/settings-edit-context"
import { useLeaveGuard } from "@/hooks/use-leave-guard"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import { turnOnReturnToSchema } from "@/lib/validations/cleanup-actions"

/** The six sections, in page order (UX 4.10). `?section=` opens one of these in Edit. @internal */
export const SETTINGS_SECTIONS = ["cleanup-feature", "cleanup-protections", "cleanup-budget", "cleanup-defaults", "cleanup-plex", "cleanup-members"] as const
type SectionId = (typeof SETTINGS_SECTIONS)[number]

const isSection = (value: string | null): value is SectionId => value !== null && (SETTINGS_SECTIONS as readonly string[]).includes(value)

/** A `returnTo` that the shared rule id pattern accepts (TS 12.7 item 10, delivery-r4-1), else null: it is dropped. @internal */
export function parseReturnTo(value: string | null): string | null {
  const parsed = turnOnReturnToSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Opens the section that `?section=` names in Edit, once per visit of that value. */
function OpenSection({ id }: { id: SectionId }) {
  const { requestEdit } = useSectionEditing(id)
  const open = useRef(requestEdit)
  useEffect(() => {
    open.current = requestEdit
  })
  useEffect(() => {
    open.current()
  }, [id])
  return null
}

/**
 * The Settings tab of Media cleanup (UX 4.10, `shots/10-settings.png`): six
 * `SettingsSection`s, each read first and then Edit, one at a time. A link
 * with `?section=cleanup-feature` opens that section in Edit, and a valid
 * `returnTo` from the turn-on page adds "Back to Turn on {rule}" after a
 * save (TS 12.7 item 10). While a section has unsaved changes, the browser
 * asks before the tab closes or reloads.
 */
export function SettingsTab({ data }: { data: CleanupSettingsData }) {
  const params = useSearchParams()
  const section = params.get("section")
  const returnTo = parseReturnTo(params.get("returnTo"))
  const [now] = useState(() => Date.now())
  const [dirty, setDirty] = useState<ReadonlySet<string>>(() => new Set())
  const onDirtyChange = useCallback((id: string, isDirty: boolean) => {
    setDirty((prev) => {
      if (prev.has(id) === isDirty) return prev
      const next = new Set(prev)
      if (isDirty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  useLeaveGuard(dirty.size > 0)

  return (
    <SettingsEditProvider onDirtyChange={onDirtyChange}>
      {isSection(section) && <OpenSection id={section} />}
      <div className="flex flex-col gap-6" data-testid="admin-cleanup-settings">
        <FeatureSection data={data} returnTo={returnTo} now={now} />
        <ProtectionsSection data={data} />
        <BudgetSection data={data} />
        <DefaultsSection data={data} />
        <PlexSection data={data} now={now} />
        <MembersSection data={data} />
      </div>
    </SettingsEditProvider>
  )
}
