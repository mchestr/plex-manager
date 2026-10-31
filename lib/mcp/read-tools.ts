/**
 * The admin pages' reads as MCP tools: the lists and details an action needs
 * ids from (users, invites, affiliates, jobs) and the settings it changes.
 * Server Actions only write, so without these a client could change things it
 * cannot see.
 *
 * Every tool checks `assertAdmin()` (or the loader's own permission) before it
 * reads, as the loaders behind the admin pages do, and returns what those pages
 * render: secrets are already replaced by their last four (`getAdminSettings`).
 *
 * @module lib/mcp/read-tools
 */

import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import { listAnnouncements } from "@/lib/admin/announcements"
import { getDiscordOverview } from "@/lib/admin/discord"
import { INVITES_DEFAULT_SORT, INVITES_SORTS } from "@/lib/admin/invites/filter"
import { jellyfinLibraryListing, plexLibraryListing } from "@/lib/admin/invites/libraries"
import { getInviteDetail, listInvites } from "@/lib/admin/invites/queries"
import { getAdminOverview } from "@/lib/admin/overview"
import { getQueueDashboard } from "@/lib/admin/queues"
import { publicInviteUrl } from "@/lib/admin/routes"
import { getUserDetailHeader } from "@/lib/admin/user-detail"
import { getAdminSettings, getStripeConfig } from "@/lib/data/admin-settings"
import { getAllUsersWithWrapped } from "@/lib/data/admin-users"
import { getAffiliateHistory } from "@/lib/data/affiliate-history"
import { getAffiliateSettingsView } from "@/lib/data/affiliate-settings"
import { getInviteTree, listAffiliateApplications, listAffiliates } from "@/lib/data/affiliates"
import { getAssistantSources } from "@/lib/data/assistant-sources"
import { getChannelStatsSettings, getMemberTierCheck, getRequestTierSettings } from "@/lib/data/community-stats"
import { getLLMUsageRecords } from "@/lib/data/llm-usage"
import { getBaseUrl } from "@/lib/env"
import { toolInputSchema } from "@/lib/mcp/json-schema"
import type { McpTool } from "@/lib/mcp/types"
import { getSeasonState } from "@/lib/wrapped/season"

const id = z.string().min(1).max(100)

interface ReadTool<S extends z.ZodType> {
  name: string
  description: string
  input?: S
  read: (input: z.output<S>) => Promise<unknown>
}

/** A read tool: admin only, its input parsed, its result as JSON (`null` reads as "not found"). */
function readTool<S extends z.ZodType>({ name, description, input, read }: ReadTool<S>): McpTool {
  const { inputSchema } = toolInputSchema(input ?? null)
  return {
    name,
    description: `${description} Admin only.`,
    inputSchema,
    annotations: { readOnlyHint: true },
    source: "loader",
    allowed: (session) => session.user.isAdmin,
    run: async (args) => {
      await assertAdmin()
      const parsed = input ? input.safeParse(args) : { success: true as const, data: undefined }
      if (!parsed.success) {
        return { text: JSON.stringify({ success: false, code: "VALIDATION", error: parsed.error.issues[0]?.message ?? "Invalid input" }), isError: true }
      }
      const data = await read(parsed.data as z.output<S>)
      if (data === null) return { text: JSON.stringify({ success: false, code: "NOT_FOUND", error: "Not found" }), isError: true }
      return { text: JSON.stringify({ success: true, data }), isError: false }
    },
  }
}

const inviteUrl = (code: string) => publicInviteUrl(code, getBaseUrl())

const listInvitesInput = z.object({
  status: z.enum(["all", "active", "expired", "usedUp"]).default("active"),
  server: z.enum(["all", "plex", "jellyfin"]).default("all"),
  q: z.string().trim().max(32).default("").describe("Part of a code"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(INVITES_SORTS).default(INVITES_DEFAULT_SORT.id as (typeof INVITES_SORTS)[number]),
  desc: z.boolean().default(true),
})

const llmUsageInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  userId: z.string().min(1).max(100).optional(),
  conversationId: z.string().min(1).max(100).optional(),
})

const seasonYear = async (year: number | undefined) => year ?? (await getSeasonState()).seasonYear

/** Every read tool. */
export function readTools(): McpTool[] {
  return [
    readTool({
      name: "list_invites",
      description: "Admin invites by status and server, newest first, with each invite's code, uses, expiry and `url`, the link to send.",
      input: listInvitesInput,
      read: async ({ sort, desc, ...rest }) => {
        const list = await listInvites({ ...rest, sort: { id: sort, desc } })
        return { ...list, rows: list.rows.map((row) => ({ ...row, url: inviteUrl(row.code) })) }
      },
    }),
    readTool({
      name: "get_invite",
      description: "One admin invite by id: its settings, libraries, who redeemed it, and `url`, the link to send.",
      input: z.object({ inviteId: id }),
      read: async ({ inviteId }) => {
        const invite = await getInviteDetail(inviteId)
        return invite && { ...invite, url: inviteUrl(invite.code) }
      },
    }),
    readTool({
      name: "list_plex_libraries",
      description: "The Plex server's libraries, with the section ids `create_invite` takes as `librarySectionIds`.",
      read: () => plexLibraryListing(),
    }),
    readTool({
      name: "list_jellyfin_libraries",
      description: "The Jellyfin server's libraries, with the ids `create_invite` takes as `jellyfinLibraryIds`.",
      read: () => jellyfinLibraryListing(),
    }),
    readTool({
      name: "list_users",
      description: "Every user with their id, services, access, admin flag, role and Rewind status for a season year (the current season by default).",
      input: z.object({ year: z.number().int().min(2000).max(2100).optional() }),
      read: async ({ year }) => getAllUsersWithWrapped(await seasonYear(year)),
    }),
    readTool({
      name: "get_user",
      description: "One user by id: their profile, services, subscription, access and Rewind state for a season year (the current season by default).",
      input: z.object({ userId: id, year: z.number().int().min(2000).max(2100).optional() }),
      read: async ({ userId, year }) => getUserDetailHeader(userId, await seasonYear(year)),
    }),
    readTool({ name: "get_admin_overview", description: "The admin overview: members, activity, health and what needs attention.", read: () => getAdminOverview() }),
    readTool({ name: "get_queue_dashboard", description: "The job queues: counts by state, whether each is paused, and recent failed jobs with their ids.", read: () => getQueueDashboard() }),
    readTool({ name: "list_announcements", description: "Every announcement with its id, text, priority, whether it shows, and its expiry.", read: () => listAnnouncements() }),
    readTool({
      name: "get_admin_settings",
      description: "Every setting on the settings page: the service connections, AI providers, Discord, Rewind and server config. Secrets show only their last four.",
      read: () => getAdminSettings(),
    }),
    readTool({ name: "get_stripe_config", description: "Whether Stripe is on and configured, and its price ids. Never the keys.", read: () => getStripeConfig() }),
    readTool({ name: "get_discord_overview", description: "The Discord integration and bot state.", read: () => getDiscordOverview() }),
    readTool({ name: "list_affiliate_applications", description: "Pending affiliate applications, with their ids.", read: () => listAffiliateApplications() }),
    readTool({ name: "list_affiliates", description: "Approved affiliates with their invite counts and overrides.", read: () => listAffiliates() }),
    readTool({ name: "get_affiliate_invite_tree", description: "Who invited whom through affiliate invites.", read: () => getInviteTree() }),
    readTool({ name: "get_affiliate_history", description: "Decided affiliate applications and blocked Plex accounts.", read: () => getAffiliateHistory() }),
    readTool({ name: "get_affiliate_settings", description: "The affiliate switch, tiers, server cap and libraries.", read: () => getAffiliateSettingsView() }),
    readTool({ name: "get_assistant_sources", description: "The admin assistant's MCP servers and knowledge bases, with their ids.", read: () => getAssistantSources() }),
    readTool({ name: "get_channel_stats_settings", description: "The Discord channel stats settings.", read: () => getChannelStatsSettings() }),
    readTool({ name: "get_request_tier_settings", description: "The request-limit tiers and the last daily sync.", read: () => getRequestTierSettings() }),
    readTool({
      name: "get_member_tier_check",
      description: "Which request-limit tier a member matches and what Overseerr has for them.",
      input: z.object({ userId: id }),
      read: ({ userId }) => getMemberTierCheck(userId),
    }),
    readTool({
      name: "list_llm_usage",
      description: "LLM calls, newest first, with model, cost and purpose; optionally one user's or one conversation's.",
      input: llmUsageInput,
      read: (input) => getLLMUsageRecords(input),
    }),
  ]
}
