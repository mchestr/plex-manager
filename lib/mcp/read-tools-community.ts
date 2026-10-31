/**
 * The community reads as MCP tools: announcements, affiliates, the assistant's
 * sources, the Discord channel stats and the request limits. Lists page
 * (`lib/mcp/paging.ts`) and clip long text, so a result stays under the size
 * cap (`lib/mcp/result-limit.ts`); `get_announcement` reads one in full.
 *
 * @module lib/mcp/read-tools-community
 */

import "server-only"

import { z } from "zod"

import { listAnnouncements } from "@/lib/admin/announcements"
import { getAffiliateHistory } from "@/lib/data/affiliate-history"
import { getAffiliateSettingsView } from "@/lib/data/affiliate-settings"
import { getInviteTree, listAffiliateApplications, listAffiliates } from "@/lib/data/affiliates"
import { getAssistantSources } from "@/lib/data/assistant-sources"
import { getChannelStatsSettings, getMemberTierCheck, getRequestTierSettings } from "@/lib/data/community-stats"
import { pageFields, paginate } from "@/lib/mcp/paging"
import { clip, idArg, readTool } from "@/lib/mcp/read-tool"
import type { McpTool } from "@/lib/mcp/types"

/** The most of an announcement's text a list row carries. */
const ANNOUNCEMENT_PREVIEW_CHARS = 300

const paged = (defaultSize: number, maxSize: number) => z.object(pageFields(defaultSize, maxSize))

/** Every community read tool. */
export function communityReadTools(): McpTool[] {
  return [
    readTool({
      name: "list_announcements",
      description: `Announcements with their id, title, priority, status (active, hidden or expired), expiry and the first ${ANNOUNCEMENT_PREVIEW_CHARS} characters of their text, highest priority first. Filter by status; pages with page and pageSize. get_announcement reads one in full.`,
      input: z.object({ status: z.enum(["all", "active", "hidden", "expired"]).default("all"), ...pageFields(20, 50) }),
      read: async ({ status, page, pageSize }) => {
        const rows = (await listAnnouncements()).filter((row) => status === "all" || row.status === status)
        return paginate(
          rows.map(({ content, ...row }) => {
            const preview = clip(content, ANNOUNCEMENT_PREVIEW_CHARS)
            return { ...row, content: preview.text, contentChars: preview.chars, contentTruncated: preview.truncated }
          }),
          page,
          pageSize
        )
      },
    }),
    readTool({
      name: "get_announcement",
      description: "One announcement by id, with its whole text.",
      input: z.object({ announcementId: idArg }),
      read: async ({ announcementId }) => (await listAnnouncements()).find((row) => row.id === announcementId) ?? null,
    }),
    readTool({
      name: "list_affiliate_applications",
      description: "Pending affiliate applications with their ids, the member, watch hours and note. Pages with page and pageSize.",
      input: paged(20, 40),
      read: async ({ page, pageSize }) => paginate(await listAffiliateApplications(), page, pageSize),
    }),
    readTool({
      name: "list_affiliates",
      description: "Approved affiliates with their invite counts, allowance and overrides. Pages with page and pageSize.",
      input: paged(20, 50),
      read: async ({ page, pageSize }) => paginate(await listAffiliates(), page, pageSize),
    }),
    readTool({
      name: "get_affiliate_invite_tree",
      description: "Who invited whom through affiliate invites, as a tree. Pages through the top-level affiliates with page and pageSize.",
      input: paged(20, 50),
      read: async ({ page, pageSize }) => paginate(await getInviteTree(), page, pageSize),
    }),
    readTool({
      name: "get_affiliate_history",
      description: "Decided affiliate applications (refused, revoked, ended), newest first, or the blocked Plex accounts. Choose the section; pages with page and pageSize.",
      input: z.object({ section: z.enum(["applications", "blocks"]).default("applications"), ...pageFields(25, 50) }),
      read: async ({ section, page, pageSize }) => {
        const history = await getAffiliateHistory()
        return section === "applications"
          ? { section, ...paginate(history.applications, page, pageSize) }
          : { section, ...paginate(history.blocks, page, pageSize) }
      },
    }),
    readTool({ name: "get_affiliate_settings", description: "The affiliate switch, tiers, server cap and libraries.", read: () => getAffiliateSettingsView() }),
    readTool({ name: "get_assistant_sources", description: "The admin assistant's MCP servers and knowledge bases, with their ids.", read: () => getAssistantSources() }),
    readTool({ name: "get_channel_stats_settings", description: "The Discord channel stats settings.", read: () => getChannelStatsSettings() }),
    readTool({
      name: "get_request_tier_settings",
      description: "The request-limit tiers and the last daily sync, with its per-member entries paged by entriesPage and entriesPageSize.",
      input: z.object({
        entriesPage: z.number().int().min(1).max(10_000).default(1),
        entriesPageSize: z.number().int().min(1).max(100).default(25),
      }),
      read: async ({ entriesPage, entriesPageSize }) => {
        const settings = await getRequestTierSettings()
        if (!settings.lastRun) return settings
        const { entries, ...lastRun } = settings.lastRun
        return { ...settings, lastRun: { ...lastRun, entries: paginate(entries, entriesPage, entriesPageSize) } }
      },
    }),
    readTool({
      name: "get_member_tier_check",
      description: "Which request-limit tier a member matches and what Overseerr has for them.",
      input: z.object({ userId: idArg }),
      read: ({ userId }) => getMemberTierCheck(userId),
    }),
  ]
}
