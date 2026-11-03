"use client"

import { KnowledgeSourceForm } from "@/components/admin/settings/knowledge-source-form"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { Badge } from "@/components/ui/badge"
import type { KnowledgeSourceSettings } from "@/lib/data/assistant-sources"

function KnowledgeRow({ source }: { source: KnowledgeSourceSettings }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-testid={`settings-knowledge-${source.id}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui font-medium text-foreground">{source.name}</span>
        <span className="truncate font-mono text-label text-muted-foreground">
          {source.repo}@{source.ref}
          {source.path && `/${source.path}`}
        </span>
      </div>
      <Badge variant={source.isActive ? "success" : "neutral"}>{source.isActive ? "On" : "Off"}</Badge>
      <SettingsSheet
        section="assistant"
        id="knowledge"
        name={source.name}
        title={source.name}
        trigger="Edit"
        triggerLabel={source.name}
        triggerTestId="settings-knowledge-edit-open"
        sheetTestId="settings-knowledge-edit-sheet"
      >
        {(sheet) => <KnowledgeSourceForm source={source} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
      </SettingsSheet>
    </li>
  )
}

/**
 * The GitHub knowledge bases the admin assistant searches and cites: the
 * list, each row's Edit Sheet and the Add Sheet. A client component, because
 * each Sheet takes its form as a render function.
 */
export function KnowledgeSourcesBlock({ sources }: { sources: KnowledgeSourceSettings[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid="settings-knowledge-list">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-ui font-medium text-foreground">Knowledge bases</h3>
        <SettingsSheet
          section="assistant"
          id="knowledge"
          name="the new knowledge base"
          title="Add a knowledge base"
          description="Use a GitHub repository of Markdown files, for example mchestr/knowledgebase."
          trigger="Add"
          triggerLabel="knowledge base"
          triggerTestId="settings-knowledge-add-open"
          sheetTestId="settings-knowledge-add-sheet"
        >
          {(sheet) => <KnowledgeSourceForm source={null} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
        </SettingsSheet>
      </div>
      {sources.length === 0 ? (
        <p className="text-label text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col divide-y">{sources.map((source) => <KnowledgeRow key={source.id} source={source} />)}</ul>
      )}
    </div>
  )
}
