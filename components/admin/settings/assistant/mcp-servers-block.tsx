"use client"

import { McpServerForm } from "@/components/admin/settings/mcp-server-form"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { Badge } from "@/components/ui/badge"
import type { McpServerSettings } from "@/lib/data/assistant-sources"

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

/**
 * The MCP servers whose tools the admin assistant may call: the list, each
 * row's Edit Sheet and the Add Sheet. A client component, because each Sheet
 * takes its form as a render function.
 */
export function McpServersBlock({ servers }: { servers: McpServerSettings[] }) {
  return (
    <div className="flex flex-col gap-2" data-testid="settings-mcp-list">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-ui font-medium text-foreground">MCP servers</h3>
        <SettingsSheet
          section="assistant"
          id="mcp"
          name="the new MCP server"
          title="Add an MCP server"
          description="After you save the server, edit it to choose its tools."
          trigger="Add"
          triggerLabel="MCP server"
          triggerTestId="settings-mcp-add-open"
          sheetTestId="settings-mcp-add-sheet"
        >
          {(sheet) => <McpServerForm server={null} onDone={sheet.onDone} onCancel={sheet.onCancel} onDirtyChange={sheet.onDirtyChange} onPendingChange={sheet.onPendingChange} />}
        </SettingsSheet>
      </div>
      {servers.length === 0 ? (
        <p className="text-label text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col divide-y">{servers.map((server) => <McpRow key={server.id} server={server} />)}</ul>
      )}
    </div>
  )
}
