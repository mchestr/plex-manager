/**
 * Columns encrypted at rest, keyed by Prisma model name (P0.18, P11.1).
 *
 * The query extension in `lib/db/encryption-extension.ts` encrypts these on
 * every write, top-level or nested, and decrypts them on every read, including
 * rows reached through `include` and `select`. `lib/security/reencrypt.ts`
 * rewrites stored plaintext and values under an old kid.
 *
 * IMPORTANT: `where` clauses are never transformed. Encryption uses a random
 * IV per write, so a plaintext equality filter on one of these columns can
 * never match: match on other columns and compare the decrypted value in code.
 *
 * Not encrypted, because they are looked up by equality: `Invite.code` and
 * `RewindShare.assetKey` (`RewindShare.tokenHash` is already a hash).
 * `PlexWrapped.shareToken` is dropped in P11.18, `DiscordOAuthState.codeVerifier`
 * is always `""`, and `DiscordChatSession.messages` is JSON that the retention
 * sweep empties (P11.14).
 */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  User: ["plexAuthToken"],
  PlexServer: ["token"],
  JellyfinServer: ["apiKey"],
  Tautulli: ["apiKey"],
  Overseerr: ["apiKey"],
  Sonarr: ["apiKey"],
  Radarr: ["apiKey"],
  LLMProvider: ["apiKey"],
  LLMUsage: ["prompt", "response"],
  DiscordIntegration: ["clientSecret", "botToken"],
  DiscordConnection: ["accessToken", "refreshToken"],
  Config: ["stripeSecretKey", "stripeWebhookSecret", "rewindSerialKey"],
}
