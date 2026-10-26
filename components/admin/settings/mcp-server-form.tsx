"use client"

import { useState } from "react"

import { deleteMcpServer, discoverMcpTools, saveMcpServer } from "@/actions/admin/assistant-sources"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SecretInput } from "@/components/ui/secret-input"
import { SettingsFormFooter } from "@/components/ui/settings-section"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { McpServerSettings } from "@/lib/data/assistant-sources"
import { safeOrigin } from "@/lib/security/saved-secret"

interface DiscoveredTool {
  name: string
  description: string
  readOnlyHint: boolean
}

type Errors = Partial<Record<"name" | "url" | "authHeaderName" | "authHeaderSecret", string>>

/**
 * One MCP server: its address, an optional auth header, and (once saved) a
 * switch per tool. A tool is off until it is switched on, so a new server
 * adds nothing to the assistant by itself.
 */
export function McpServerForm({ server, onDone }: { server: McpServerSettings | null; onDone?: () => void }) {
  const toast = useToast()
  const [errors, setErrors] = useState<Errors>({})
  const [tools, setTools] = useState<DiscoveredTool[] | null>(null)
  const [discovering, setDiscovering] = useState(false)

  const settings = useSettingsForm(
    {
      name: server?.name ?? "",
      url: server?.url ?? "",
      authHeaderName: server?.authHeaderName ?? "",
      authHeaderSecret: "",
      isActive: server?.isActive ?? true,
      enabledTools: server?.enabledTools ?? [],
    },
    async (values) => {
      const result = await saveMcpServer({ ...(server ? { id: server.id } : {}), ...values })
      if (!result.success) {
        const field = (key: keyof Errors) => result.fieldErrors?.[key]?.[0]
        setErrors({ name: field("name"), url: field("url"), authHeaderName: field("authHeaderName"), authHeaderSecret: field("authHeaderSecret") })
        toast.showError(result.error)
        return
      }
      setErrors({})
      toast.showSuccess("MCP server saved")
      onDone?.()
      return { ...values, authHeaderSecret: "" }
    }
  )
  const { values, set, form } = settings

  const discover = async () => {
    if (!server) return
    setDiscovering(true)
    const result = await discoverMcpTools({ id: server.id })
    setDiscovering(false)
    if (!result.success) return toast.showError(result.error)
    setTools(result.data.tools)
  }

  const toggle = (name: string, on: boolean) =>
    set({ enabledTools: on ? [...new Set([...values.enabledTools, name])] : values.enabledTools.filter((tool) => tool !== name) })

  const known = tools ?? values.enabledTools.map((name) => ({ name, description: "", readOnlyHint: false }))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (form.isDirty) form.onSave()
      }}
      noValidate
      className="flex flex-col gap-6"
      data-testid="settings-mcp-form"
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField name="mcp-name" label="Name" error={errors.name}>
          <Input value={values.name} onValueChange={(name) => set({ name })} placeholder="Memini" required disabled={form.isPending} data-testid="settings-mcp-name" />
        </FormField>
        <FormField name="mcp-url" label="MCP URL" description="A Streamable HTTP endpoint" error={errors.url}>
          <Input value={values.url} onValueChange={(url) => set({ url })} placeholder="https://mcp.example.com/mcp" required disabled={form.isPending} data-testid="settings-mcp-url" />
        </FormField>
        <FormField name="mcp-header-name" label="Auth header" optional description="For example Authorization" error={errors.authHeaderName}>
          <Input value={values.authHeaderName} onValueChange={(authHeaderName) => set({ authHeaderName })} placeholder="Authorization" disabled={form.isPending} data-testid="settings-mcp-header-name" />
        </FormField>
        {values.authHeaderName.trim() !== "" && (
          <FormField name="mcp-header-value" label="Header value" description="For example Bearer followed by a token" error={errors.authHeaderSecret}>
            <SecretInput
              value={values.authHeaderSecret}
              onValueChange={(authHeaderSecret) => set({ authHeaderSecret })}
              saved={server?.authSecret}
              currentOrigin={safeOrigin(values.url)}
              noun="value"
              disabled={form.isPending}
              data-testid="settings-mcp-header-value"
            />
          </FormField>
        )}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="mcp-active" className="text-ui text-foreground">Use this server</label>
          <Switch id="mcp-active" checked={values.isActive} onCheckedChange={(isActive) => set({ isActive })} disabled={form.isPending} data-testid="settings-mcp-active" />
        </div>
      </div>

      {server && (
        <div className="flex flex-col gap-3 border-t pt-4" data-testid="settings-mcp-tools">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-ui font-medium text-foreground">Tools</h4>
              <p className="text-label text-muted-foreground">Only tools you switch on reach the assistant. Switch on only the tools you trust it to call.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={discover} loading={discovering} loadingLabel="Listing" data-testid="settings-mcp-discover">
              List tools
            </Button>
          </div>
          {known.length === 0 ? (
            <p className="text-label text-muted-foreground">No tools listed yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {known.map((tool) => (
                <li key={tool.name} className="flex items-center gap-3 py-2" data-testid={`settings-mcp-tool-${tool.name}`}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-ui text-foreground">{tool.name}</span>
                    {tool.description && <span className="truncate text-label text-muted-foreground">{tool.description}</span>}
                  </div>
                  {tools && <Badge variant={tool.readOnlyHint ? "success" : "warning"}>{tool.readOnlyHint ? "read-only" : "can change data"}</Badge>}
                  <Switch label={`Allow ${tool.name}`} checked={values.enabledTools.includes(tool.name)} onCheckedChange={(on) => toggle(tool.name, on)} disabled={form.isPending} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SettingsFormFooter id="mcp" form={form} className="px-0" />
      {server && (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" size="sm" data-testid="settings-mcp-delete">
              Remove server
            </Button>
          }
          title={`Remove ${server.name}?`}
          description="The assistant stops using this server's tools."
          confirmLabel="Remove"
          pendingLabel="Removing"
          tone="destructive"
          data-testid="settings-mcp-remove"
          confirmTestId="settings-mcp-remove-confirm"
          action={async () => {
            const result = await deleteMcpServer({ id: server.id })
            if (!result.success) return { error: result.error }
            onDone?.()
            return {}
          }}
        />
      )}
    </form>
  )
}
