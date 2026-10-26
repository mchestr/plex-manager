"use client"

import { useState, type ReactNode } from "react"

import { KnowledgeSourceForm } from "@/components/admin/settings/knowledge-source-form"
import { McpServerForm } from "@/components/admin/settings/mcp-server-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/ui/settings-section"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { AssistantSources, KnowledgeSourceSettings, McpServerSettings } from "@/lib/data/assistant-sources"

interface RowSheetProps {
  testId: string
  title: string
  description: string
  trigger: string
  triggerLabel: string
  children: (close: () => void) => ReactNode
}

/** A Sheet that closes when its form reports it saved or removed the row. */
function RowSheet({ testId, title, description, trigger, triggerLabel, children }: RowSheetProps) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="sm" data-testid={`${testId}-open`} />}>
        {trigger}
        <span className="sr-only"> {triggerLabel}</span>
      </SheetTrigger>
      <SheetContent side="right" className="max-w-[480px]" data-testid={`${testId}-sheet`}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children(() => setOpen(false))}
      </SheetContent>
    </Sheet>
  )
}

function McpRow({ server }: { server: McpServerSettings }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-testid={`settings-mcp-${server.id}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui font-medium text-foreground">{server.name}</span>
        <span className="truncate font-mono text-label text-muted-foreground">{server.url}</span>
      </div>
      <Badge variant={server.isActive ? "success" : "neutral"}>{server.isActive ? `${server.enabledTools.length} tools on` : "off"}</Badge>
      <RowSheet testId="settings-mcp-edit" title={server.name} description="Address, credentials and the tools the assistant may call." trigger="Edit" triggerLabel={server.name}>
        {(close) => <McpServerForm server={server} onDone={close} />}
      </RowSheet>
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
      <Badge variant={source.isActive ? "success" : "neutral"}>{source.isActive ? "on" : "off"}</Badge>
      <RowSheet testId="settings-knowledge-edit" title={source.name} description="The GitHub repository the assistant searches and cites." trigger="Edit" triggerLabel={source.name}>
        {(close) => <KnowledgeSourceForm source={source} onDone={close} />}
      </RowSheet>
    </li>
  )
}

/**
 * Assistant sources: MCP servers whose tools the admin assistant may call,
 * and GitHub knowledge bases it searches and cites. Both start empty and add
 * nothing until the admin sets one up.
 */
export function AssistantSection({ sources }: { sources: AssistantSources }) {
  return (
    <SettingsSection
      id="assistant"
      title="Assistant sources"
      description="Extra tools and knowledge for the admin assistant. Discord never uses them."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2" data-testid="settings-mcp-list">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-ui font-medium text-foreground">MCP servers</h3>
            <RowSheet testId="settings-mcp-add" title="Add an MCP server" description="Save it first, then list its tools and switch on the ones the assistant may call." trigger="Add" triggerLabel="MCP server">
              {(close) => <McpServerForm server={null} onDone={close} />}
            </RowSheet>
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
            <RowSheet testId="settings-knowledge-add" title="Add a knowledge base" description="A GitHub repository of Markdown, for example mchestr/knowledgebase." trigger="Add" triggerLabel="knowledge base">
              {(close) => <KnowledgeSourceForm source={null} onDone={close} />}
            </RowSheet>
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
