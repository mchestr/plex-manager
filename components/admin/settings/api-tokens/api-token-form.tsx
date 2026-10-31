"use client"

import { useState, useTransition } from "react"

import { createApiToken } from "@/actions/admin/api-tokens"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { API_TOKEN_EXPIRIES, API_TOKEN_EXPIRY_LABELS, type ApiTokenExpiry } from "@/lib/mcp/token-expiry"

const EXPIRY_ITEMS = API_TOKEN_EXPIRIES.map((value) => ({ value, label: API_TOKEN_EXPIRY_LABELS[value] }))

/** The token once made, with the Claude Code command that adds the server. */
function NewToken({ token, endpoint }: { token: string; endpoint: string }) {
  const toast = useToast()
  const command = `claude mcp add --transport http plex-manager ${endpoint} --header "Authorization: Bearer ${token}"`
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.showSuccess(`${what} copied`)
    } catch {
      toast.showError("Could not copy. Select it and copy it.")
    }
  }

  return (
    <Alert tone="success" title="Copy the token now. It is not shown again." data-testid="settings-api-token-created">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="settings-api-token-value">Token</Label>
          <Input
            id="settings-api-token-value"
            value={token}
            readOnly
            className="font-mono"
            data-testid="settings-api-token-value"
            trailing={
              <Button type="button" variant="ghost" size="sm" className="-mr-2 h-7 px-2" onClick={() => void copy(token, "Token")} data-testid="settings-api-token-copy">
                Copy
              </Button>
            }
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="settings-api-token-command">Add it to Claude Code</Label>
          <Input
            id="settings-api-token-command"
            value={command}
            readOnly
            className="font-mono"
            data-testid="settings-api-token-command"
            trailing={
              <Button type="button" variant="ghost" size="sm" className="-mr-2 h-7 px-2" onClick={() => void copy(command, "Command")} data-testid="settings-api-token-command-copy">
                Copy
              </Button>
            }
          />
        </div>
      </div>
    </Alert>
  )
}

/** Makes a token: a name and an expiry, then the token, shown once. */
export function ApiTokenForm({ endpoint }: { endpoint: string }) {
  const [name, setName] = useState("")
  const [expiresIn, setExpiresIn] = useState<ApiTokenExpiry>("90d")
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createApiToken({ name, expiresIn })
      if (!result.success) {
        setError(result.error)
        return
      }
      setToken(result.data.token)
      setName("")
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" data-testid="settings-api-token-form">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="settings-api-token-name">Name</Label>
          <Input
            id="settings-api-token-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Claude Code on my laptop"
            maxLength={60}
            required
            data-testid="settings-api-token-name"
          />
        </div>
        <Field name="expiresIn">
          <FieldLabel nativeLabel={false} render={<div />}>
            Expires
          </FieldLabel>
          <Select items={EXPIRY_ITEMS} value={expiresIn} onValueChange={(next) => next && setExpiresIn(next)}>
            <SelectTrigger aria-label="Expires" data-testid="settings-api-token-expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`settings-api-token-expiry-${item.value}`}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" loading={isPending} loadingLabel="Making" data-testid="settings-api-token-create">
          Make token
        </Button>
      </form>
      {error && (
        <Alert tone="destructive" data-testid="settings-api-token-error">
          {error}
        </Alert>
      )}
      {token && <NewToken token={token} endpoint={endpoint} />}
    </div>
  )
}
