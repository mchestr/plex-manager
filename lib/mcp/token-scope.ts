/** What a new API token may do: every tool its owner may use, or only the tools that read. */
export const API_TOKEN_SCOPES = ["full", "read"] as const
export type ApiTokenScopeOption = (typeof API_TOKEN_SCOPES)[number]

export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScopeOption, string> = {
  full: "Everything you can do",
  read: "Read only",
}
