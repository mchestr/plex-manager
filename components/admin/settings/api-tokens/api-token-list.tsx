"use client"

import { revokeApiToken } from "@/actions/admin/api-tokens"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Time } from "@/components/ui/time"
import { useActionDialog } from "@/hooks/use-action-dialog"
import type { ApiTokenRow } from "@/lib/data/api-tokens"

const revoke = (tokenId: string) => revokeApiToken({ tokenId })

function TokenRow({ token }: { token: ApiTokenRow }) {
  const { run } = useActionDialog(revoke, { success: `${token.name} revoked` })
  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-testid={`settings-api-token-${token.id}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui font-medium text-foreground">{token.name}</span>
        <span className="font-mono text-label text-muted-foreground">{token.prefix}…</span>
      </div>
      {token.scope === "read" && (
        <Badge variant="neutral" data-testid="settings-api-token-read-only">
          Read only
        </Badge>
      )}
      <dl className="flex flex-col text-label text-muted-foreground">
        <div className="flex gap-1">
          <dt>Last used</dt>
          <dd>{token.lastUsedAt ? <Time value={token.lastUsedAt} /> : "never"}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Expires</dt>
          <dd>{token.expiresAt ? <Time value={token.expiresAt} /> : "never"}</dd>
        </div>
      </dl>
      <ConfirmDialog
        trigger={
          <Button variant="outline" size="sm" data-testid="settings-api-token-revoke-open">
            Revoke
          </Button>
        }
        title={`Revoke ${token.name}?`}
        description="Anything using this token loses access at once. This cannot be undone."
        confirmLabel="Revoke token"
        pendingLabel="Revoking"
        tone="destructive"
        action={() => run(token.id)}
        confirmTestId="settings-api-token-revoke-confirm"
      />
    </li>
  )
}

/** The caller's live tokens, each with Revoke. */
export function ApiTokenList({ tokens }: { tokens: ApiTokenRow[] }) {
  if (tokens.length === 0) return <p className="text-label text-muted-foreground">No tokens yet.</p>
  return (
    <ul className="flex flex-col divide-y" data-testid="settings-api-token-list">
      {tokens.map((token) => (
        <TokenRow key={token.id} token={token} />
      ))}
    </ul>
  )
}
