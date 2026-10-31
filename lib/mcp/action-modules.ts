/**
 * The action modules the MCP endpoint offers as tools (`lib/mcp/action-tools.ts`),
 * and the action files it leaves out. Every file under `actions/` is in one
 * of the two lists; `lib/mcp/__tests__/action-modules.test.ts` checks it.
 *
 * @module lib/mcp/action-modules
 */

import "server-only"

import * as account from "@/actions/account"
import * as adminConfig from "@/actions/admin/admin-config"
import * as adminLlmProviders from "@/actions/admin/admin-llm-providers"
import * as adminServers from "@/actions/admin/admin-servers"
import * as adminUsers from "@/actions/admin/admin-users"
import * as affiliateSettings from "@/actions/admin/affiliate-settings"
import * as adminAffiliates from "@/actions/admin/affiliates"
import * as assistantSources from "@/actions/admin/assistant-sources"
import * as connectionHealth from "@/actions/admin/connection-health"
import * as discordStats from "@/actions/admin/discord-stats"
import * as invites from "@/actions/admin/invites"
import * as memberAccess from "@/actions/admin/member-access"
import * as queue from "@/actions/admin/queue"
import * as requestTiers from "@/actions/admin/request-tiers"
import * as rewindPlayground from "@/actions/admin/rewind-playground"
import * as rewindSeason from "@/actions/admin/rewind-season"
import * as rewindSettings from "@/actions/admin/rewind-settings"
import * as subscriptions from "@/actions/admin/subscriptions"
import * as testConnection from "@/actions/admin/test-connection"
import * as adminWatchlist from "@/actions/admin/watchlist"
import * as affiliate from "@/actions/affiliate"
import * as announcements from "@/actions/announcements"
import * as chatbot from "@/actions/chatbot"
import * as discord from "@/actions/discord"
import * as importPlexUsers from "@/actions/import-plex-users"
import * as memberData from "@/actions/member-data"
import * as onboarding from "@/actions/onboarding"
import * as rewindExclusions from "@/actions/rewind-exclusions"
import * as rewindGeneration from "@/actions/rewind-generation"
import * as rewindNotify from "@/actions/rewind-notify"
import * as rewindSharing from "@/actions/rewind-sharing"
import * as serverInfo from "@/actions/server-info"
import * as setup from "@/actions/setup"
import * as subscription from "@/actions/subscription"
import * as userQueries from "@/actions/user-queries"
import * as watchlist from "@/actions/watchlist"
import * as wrappedShareLink from "@/actions/wrapped-share-link"

/** The action modules whose actions are tools, by their path under `actions/`. */
export const ACTION_MODULES: Readonly<Record<string, Record<string, unknown>>> = {
  account,
  "admin/admin-config": adminConfig,
  "admin/admin-llm-providers": adminLlmProviders,
  "admin/admin-servers": adminServers,
  "admin/admin-users": adminUsers,
  "admin/affiliate-settings": affiliateSettings,
  "admin/affiliates": adminAffiliates,
  "admin/assistant-sources": assistantSources,
  "admin/connection-health": connectionHealth,
  "admin/discord-stats": discordStats,
  "admin/invites": invites,
  "admin/member-access": memberAccess,
  "admin/queue": queue,
  "admin/request-tiers": requestTiers,
  "admin/rewind-playground": rewindPlayground,
  "admin/rewind-season": rewindSeason,
  "admin/rewind-settings": rewindSettings,
  "admin/subscriptions": subscriptions,
  "admin/test-connection": testConnection,
  "admin/watchlist": adminWatchlist,
  affiliate,
  announcements,
  "chatbot/index": chatbot,
  discord,
  "import-plex-users": importPlexUsers,
  "member-data": memberData,
  onboarding,
  "rewind-exclusions": rewindExclusions,
  "rewind-generation": rewindGeneration,
  "rewind-notify": rewindNotify,
  "rewind-sharing": rewindSharing,
  "server-info": serverInfo,
  setup,
  subscription,
  "user-queries": userQueries,
  watchlist,
  "wrapped-share-link": wrappedShareLink,
}

/**
 * Action files that are not tools at all, with the reason, by their path under
 * `actions/`. `api-tokens` makes tokens: a token must not mint another.
 *
 * @internal Read by the catalog test, which checks every file is listed.
 */
export const EXCLUDED_MODULES: Readonly<Record<string, string>> = {
  "admin/api-tokens": "makes and revokes MCP tokens",
  "announcements-seen": "records what a browser showed",
  appearance: "sets a browser cookie",
  invite: "public invite redemption",
  "rewind-views": "records what a browser showed",
  "setup-claim": "the first-run claim cookie",
  "setup-plex": "the setup Plex PIN, kept in a browser cookie",
}
