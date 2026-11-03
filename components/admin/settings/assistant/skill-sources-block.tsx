"use client"

import { useTransition } from "react"

import { refreshSkillSource } from "@/actions/admin/assistant-skills"
import { CheckSkillsDialog } from "@/components/admin/settings/assistant/check-skills-dialog"
import { SkillSourceForm } from "@/components/admin/settings/assistant/skill-source-form"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import type { SkillSourceSettings } from "@/lib/data/assistant-sources"

/** Both Sheets say it, so it shows wherever a pinned ref might be changed to a branch. */
const SKILL_WARNING = "The assistant follows skills as instructions. Add only repositories you control, and pin a tag or commit."

/**
 * Refresh reads a branch or tag's ref again now. At a pinned commit it reads
 * nothing again, but it forgets a remembered rate limit, so the toast never
 * claims a re-read.
 */
function RefreshButton({ source }: { source: SkillSourceSettings }) {
  const toast = useToast()
  const [refreshing, startRefresh] = useTransition()

  const refresh = () =>
    startRefresh(async () => {
      const result = await refreshSkillSource({ id: source.id })
      if (result.success) toast.showSuccess("Skill source refreshed")
      else toast.showError(result.error)
    })

  return (
    <Button variant="ghost" size="sm" onClick={refresh} loading={refreshing} loadingLabel="Refreshing" data-testid="settings-skill-refresh">
      Refresh
      <span className="sr-only"> {source.name}</span>
    </Button>
  )
}

function SkillRow({ source }: { source: SkillSourceSettings }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-testid={`settings-skill-${source.id}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui font-medium text-foreground">{source.name}</span>
        <span className="truncate font-mono text-label text-muted-foreground">
          {source.repo}@{source.ref}
          {source.path && `/${source.path}`}
        </span>
      </div>
      <Badge variant={source.isActive ? "success" : "neutral"}>{source.isActive ? "On" : "Off"}</Badge>
      {!source.pinned && (
        <Badge variant="warning" data-testid="settings-skill-moving-ref">
          Follows a moving ref
        </Badge>
      )}
      <RefreshButton source={source} />
      <CheckSkillsDialog source={source} />
      <SettingsSheet
        section="assistant"
        id="skill"
        name={source.name}
        title={source.name}
        description={SKILL_WARNING}
        trigger="Edit"
        triggerLabel={source.name}
        triggerTestId="settings-skill-edit-open"
        sheetTestId="settings-skill-edit-sheet"
      >
        {(sheet) => <SkillSourceForm source={source} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
      </SettingsSheet>
    </li>
  )
}

/**
 * The GitHub repositories of Agent Skills the admin assistant lists and
 * follows: the list, each row's Refresh, Check skills and Edit Sheet, and the
 * Add Sheet. A row whose ref is not a full commit SHA carries a standing
 * "Follows a moving ref" warning. A client component, because each Sheet
 * takes its form as a render function.
 */
export function SkillSourcesBlock({ sources }: { sources: SkillSourceSettings[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid="settings-skill-list">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-ui font-medium text-foreground">Skills</h3>
        <SettingsSheet
          section="assistant"
          id="skill"
          name="the new skill source"
          title="Add a skill source"
          description={SKILL_WARNING}
          trigger="Add"
          triggerLabel="skill source"
          triggerTestId="settings-skill-add-open"
          sheetTestId="settings-skill-add-sheet"
        >
          {(sheet) => <SkillSourceForm source={null} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
        </SettingsSheet>
      </div>
      {sources.length === 0 ? (
        <p className="text-label text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col divide-y">{sources.map((source) => <SkillRow key={source.id} source={source} />)}</ul>
      )}
    </div>
  )
}
