import { ApiTokenForm } from "@/components/admin/settings/api-tokens/api-token-form"
import { ApiTokenList } from "@/components/admin/settings/api-tokens/api-token-list"
import { SettingsSection } from "@/components/ui/settings-section"
import type { ApiTokenRow } from "@/lib/data/api-tokens"

/**
 * API access: personal tokens for the MCP endpoint, so an MCP client such as
 * Claude Code can run every admin action as you (docs/mcp.md). Each admin sees
 * and revokes only their own tokens.
 */
export function ApiAccessSection({ tokens, endpoint }: { tokens: ApiTokenRow[]; endpoint: string }) {
  return (
    <SettingsSection
      id="api-access"
      title="API access"
      description={`Personal tokens for the MCP endpoint at ${endpoint}. A token can do anything you can do here, or only read if you choose, so keep it secret.`}
    >
      <div className="flex flex-col gap-6">
        <ApiTokenForm endpoint={endpoint} />
        <div className="flex flex-col gap-2">
          <h3 className="text-ui font-medium text-foreground">Your tokens</h3>
          <ApiTokenList tokens={tokens} />
        </div>
      </div>
    </SettingsSection>
  )
}
