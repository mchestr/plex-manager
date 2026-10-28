"use client"

import { KnowledgeSourceForm } from "@/components/admin/settings/knowledge-source-form"
import { McpServerForm } from "@/components/admin/settings/mcp-server-form"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { Badge } from "@/components/ui/badge"
import { SettingsSection } from "@/components/ui/settings-section"
import type { AssistantSources, KnowledgeSourceSettings, McpServerSettings } from "@/lib/data/assistant-sources"

const MCP_DESCRIPTION = "Allow only the tools that the assistant can use."
const KNOWLEDGE_DESCRIPTION = "The assistant searches this GitHub repository and cites it in answers."

/** "1 tool on", "3 tools on" or "Off". */
function toolCount(server: McpServerSettings) {
  if (!server.isActive) return "Off"
  const count = server.enabledTools.length
  return `${count} ${count === 1 ? "tool" : "tools"} on`
}

function McpRow({ server }: { server: McpServerSettings }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-testid={`settings-mcp-${server.id}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui font-medium text-foreground">{server.name}</span>
        <span className="truncate font-mono text-label text-muted-foreground">{server.url}</span>
      </div>
      <Badge variant={server.isActive ? "success" : "neutral"}>{toolCount(server)}</Badge>
      <SettingsSheet
        section="assistant"
        id="mcp"
        name={server.name}
        title={server.name}
        description={MCP_DESCRIPTION}
        trigger="Edit"
        triggerLabel={server.name}
        triggerTestId="settings-mcp-edit-open"
        sheetTestId="settings-mcp-edit-sheet"
      >
        {(sheet) => <McpServerForm server={server} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
      </SettingsSheet>
    </li>
  )
}

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
        description={KNOWLEDGE_DESCRIPTION}
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
 * Assistant sources: MCP servers whose tools the admin assistant may call,
 * and GitHub knowledge bases it searches and cites. Both start empty and add
 * nothing until the admin sets one up. The lists are the view, with no
 * section Edit; each row's Edit, and each list's Add, opens its form in a
 * Sheet, its edit mode.
 */
export function AssistantSection({ sources }: { sources: AssistantSources }) {
  return (
    <SettingsSection
      id="assistant"
      title="Assistant sources"
      description="Only the admin assistant uses these sources. The Discord assistant does not."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2" data-testid="settings-mcp-list">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-ui font-medium text-foreground">MCP servers</h3>
            <SettingsSheet
              section="assistant"
              id="mcp"
              name="the new MCP server"
              title="Add an MCP server"
              description="Save the server first. Then list its tools and allow the tools that the assistant can use."
              trigger="Add"
              triggerLabel="MCP server"
              triggerTestId="settings-mcp-add-open"
              sheetTestId="settings-mcp-add-sheet"
            >
              {(sheet) => <McpServerForm server={null} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
            </SettingsSheet>
          </div>
          {sources.mcpServers.length === 0 ? (
            <p className="text-label text-muted-foreground">None yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">{sources.mcpServers.map((server) => <McpRow key={server.id} server={server} />)}</ul>
          )}
        </div>
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
          {sources.knowledgeSources.length === 0 ? (
            <p className="text-label text-muted-foreground">None yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">{sources.knowledgeSources.map((source) => <KnowledgeRow key={source.id} source={source} />)}</ul>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
