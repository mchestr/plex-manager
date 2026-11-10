"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { previewCleanupProtectionImpact } from "@/actions/admin/cleanup-preview"
import { RefreshDataButton } from "@/components/admin/cleanup/page/refresh-data-button"
import { RunAllButton } from "@/components/admin/cleanup/page/run-all-dialog"
import { FeatureState, FeatureSummary, LastRunLine } from "@/components/admin/cleanup/settings/feature-summary"
import { CheckboxField, useCleanupSettingsForm } from "@/components/admin/cleanup/settings/section-parts"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/ui/settings-section"
import { cleanupTurnOn } from "@/lib/admin/routes"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"

/** UX 8.8. */
const FEATURE_WORDS = {
  title: "Media cleanup",
  description:
    "Turns cleanup on for every rule. Off or paused, no run changes anything, the Leaving soon collections empty, and every Keep stays. Previews and dry runs still work.",
  label: "Turn on media cleanup",
  hint: "Rules in Review first or Automatic start to put titles in Leaving soon. Nothing is deleted for 7 days.",
} as const

/** The rule id of a parsed `returnTo` (`/admin/cleanup/rules/{id}/turn-on`). */
const ruleIdOf = (returnTo: string): string => returnTo.split("/")[4] ?? ""

/**
 * The name of the rule that `returnTo` points at, for "Back to Turn on
 * {rule}". The Settings data names no rule, so it reads the names that the
 * protection preview lists, once. Null until then, and for a gone rule.
 */
function useReturnRuleName(returnTo: string | null, protections: CleanupSettingsData["options"]["protections"]): string | null {
  const [name, setName] = useState<{ returnTo: string; name: string } | null>(null)
  const saved = useRef(protections)
  useEffect(() => {
    if (!returnTo) return
    const id = ruleIdOf(returnTo)
    let current = true
    void previewCleanupProtectionImpact({ protections: saved.current }).then((result) => {
      const rule = result.success ? result.data.rules.find((r) => r.ruleId === id) : undefined
      if (current && rule) setName({ returnTo, name: rule.name })
    })
    return () => {
      current = false
    }
  }, [returnTo])
  return name && name.returnTo === returnTo ? name.name : null
}

/** "Back to Turn on {rule}" (UX 4.10 rule 7, TS 12.7 item 10): the way back after a saved section. */
function ReturnLink({ returnTo, name }: { returnTo: string; name: string | null }) {
  return (
    <Button
      variant="link"
      size="sm"
      className="self-start px-0"
      nativeButton={false}
      render={<Link href={cleanupTurnOn(ruleIdOf(returnTo))} />}
      data-testid="admin-cleanup-settings-return"
    >
      {name ? `Back to Turn on ${name}` : "Back to Turn on the rule"}
    </Button>
  )
}

interface FeatureSectionProps {
  data: CleanupSettingsData
  /** A `returnTo` that `turnOnReturnToSchema` accepted, else null. */
  returnTo: string | null
  /** The render's clock, for "today". */
  now: number
}

/**
 * The Media cleanup section (UX 4.10, 8.8, `shots/10-settings.png`): the
 * status badge, the switch, the nightly run, the library data and the
 * Tautulli history start, then the last run with "Refresh data now" and
 * "Run all rules now". Edit holds the one checkbox "Turn on media cleanup".
 * Off is not destructive, so it opens no dialog (rule 5). On applies the
 * 7-day hold (rule 6). With a valid `returnTo`, a save shows "Back to Turn
 * on {rule}" (rule 7).
 */
export function FeatureSection({ data, returnTo, now }: FeatureSectionProps) {
  const enabled = data.feature.enabled
  const [savedOnce, setSavedOnce] = useState(false)
  const ruleName = useReturnRuleName(returnTo, data.options.protections)
  const feature = useCleanupSettingsForm(
    { enabled },
    (values) => ({ input: { section: "cleanup-feature", values: { enabled: values.enabled } } }),
    () => setSavedOnce(true)
  )

  return (
    <SettingsSection
      id="cleanup-feature"
      title={FEATURE_WORDS.title}
      description={FEATURE_WORDS.description}
      form={feature.form}
      live={<FeatureState data={data} now={now} />}
      view={<FeatureSummary data={data} now={now} />}
      after={(editing) =>
        !editing && (
          <div className="flex flex-col gap-4">
            {savedOnce && returnTo && <ReturnLink returnTo={returnTo} name={ruleName} />}
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <LastRunLine lastRun={data.lastRun} now={now} />
              <div className="flex flex-wrap items-center gap-2">
                <RefreshDataButton redis={data.feature.redis} reading={data.libraryData.reading} data-testid="admin-cleanup-settings-refresh-data" />
                <RunAllButton redis={data.feature.redis} dataFrom={data.libraryData.finishedAt} now={now} />
              </div>
            </div>
          </div>
        )
      }
    >
      <CheckboxField
        id="cleanup-feature-enabled"
        label={FEATURE_WORDS.label}
        hint={FEATURE_WORDS.hint}
        checked={feature.values.enabled}
        onCheckedChange={(next) => feature.set({ enabled: next })}
        disabled={feature.form.isPending}
        changedFrom={feature.values.enabled === enabled ? undefined : enabled}
      />
    </SettingsSection>
  )
}
