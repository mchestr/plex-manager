/**
 * The admin pages' reads as MCP tools: the lists and details an action needs
 * ids from (users, invites, jobs, LLM calls) and the settings it changes.
 * Server Actions only write, so without these a client could change things it
 * cannot see. The LLM usage reads are in `lib/mcp/read-tools-llm.ts`, and the
 * community reads (announcements, affiliates, request limits) in
 * `lib/mcp/read-tools-community.ts`.
 *
 * Every tool checks `assertAdmin()` (or the loader's own permission) before it
 * reads (`lib/mcp/read-tool.ts`), and returns what those pages render: secrets
 * are already replaced by their last four (`getAdminSettings`). Lists page and
 * leave out long text, so a result stays under the size cap
 * (`lib/mcp/result-limit.ts`); a `get_*` tool reads one row in full.
 *
 * @module lib/mcp/read-tools
 */

import "server-only"

import { z } from "zod"

import { getDiscordOverview } from "@/lib/admin/discord"
import { INVITES_DEFAULT_SORT, INVITES_SORTS } from "@/lib/admin/invites/filter"
import { jellyfinLibraryListing, plexLibraryListing } from "@/lib/admin/invites/libraries"
import { getInviteDetail, listInvites } from "@/lib/admin/invites/queries"
import { getAdminOverview } from "@/lib/admin/overview"
import { getQueueDashboard } from "@/lib/admin/queues"
import { getUserDetailHeader } from "@/lib/admin/user-detail"
import { getAdminSettings, getStripeConfig } from "@/lib/data/admin-settings"
import { getAllUsersWithWrapped } from "@/lib/data/admin-users"
import { matches, pageFields, paginate } from "@/lib/mcp/paging"
import { idArg, inviteUrl, readTool, seasonYear, yearArg } from "@/lib/mcp/read-tool"
import { communityReadTools } from "@/lib/mcp/read-tools-community"
import { llmReadTools } from "@/lib/mcp/read-tools-llm"
import type { McpTool } from "@/lib/mcp/types"
import type { AdminUserWithWrappedStats } from "@/types/admin"

const listInvitesInput = z.object({
  status: z.enum(["all", "active", "expired", "usedUp"]).default("active"),
  server: z.enum(["all", "plex", "jellyfin"]).default("all"),
  q: z.string().trim().max(32).default("").describe("Part of a code"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(INVITES_SORTS).default(INVITES_DEFAULT_SORT.id as (typeof INVITES_SORTS)[number]),
  desc: z.boolean().default(true),
})

const listUsersInput = z.object({
  year: yearArg,
  q: z.string().trim().max(100).default("").describe("Part of a name or email"),
  ...pageFields(25, 50),
})

/** A users-list row: who they are, their access and their Rewind; `get_user` has the rest. */
function userRow(user: AdminUserWithWrappedStats) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    services: user.services,
    primaryService: user.primaryService,
    isAdmin: user.isAdmin,
    role: user.role,
    isOwner: user.isOwner,
    disabledAt: user.disabledAt,
    createdAt: user.createdAt,
    hasPlexAccess: user.hasPlexAccess,
    subscriptionStatus: user.subscriptionStatus,
    isExempt: user.isExempt,
    rewindStatus: user.wrappedStatus,
    invitedBy: user.invitedBy ?? null,
  }
}

/** Every read tool. */
export function readTools(): McpTool[] {
  return [
    readTool({
      name: "list_invites",
      description: "Admin invites by status and server, newest first, with each invite's code, uses, expiry and `url`, the link to send. Pages with page and pageSize.",
      input: listInvitesInput,
      read: async ({ sort, desc, ...rest }) => {
        const list = await listInvites({ ...rest, sort: { id: sort, desc } })
        return { ...list, rows: list.rows.map((row) => ({ ...row, url: inviteUrl(row.code) })) }
      },
    }),
    readTool({
      name: "get_invite",
      description: "One admin invite by id: its settings, libraries, who redeemed it, and `url`, the link to send.",
      input: z.object({ inviteId: idArg }),
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
      description:
        "Users (members and admins) with their id, email, services, access, admin flag, role, subscription and Rewind status, optionally only those whose name or email contains q. Pages with page and pageSize; get_user has one user's details.",
      input: listUsersInput,
      read: async ({ year, q, page, pageSize }) => {
        const { users, plexCheck } = await getAllUsersWithWrapped(await seasonYear(year))
        const { rows, ...meta } = paginate(users.filter((user) => matches(q, user.name, user.email)).map(userRow), page, pageSize)
        return { plexCheck, ...meta, users: rows }
      },
    }),
    readTool({
      name: "get_user",
      description: "One user by id: their profile, services, subscription, access and Rewind state for a season year (the current season by default).",
      input: z.object({ userId: idArg, year: yearArg }),
      read: async ({ userId, year }) => getUserDetailHeader(userId, await seasonYear(year)),
    }),
    readTool({ name: "get_admin_overview", description: "The admin overview: members, activity, health and what needs attention.", read: () => getAdminOverview() }),
    readTool({ name: "get_queue_dashboard", description: "The job queues: counts by state, whether each is paused, and recent failed jobs with their ids.", read: () => getQueueDashboard() }),
    readTool({
      name: "get_admin_settings",
      description: "Every setting on the settings page: the service connections, AI providers, Discord, Rewind and server config. Secrets show only their last four.",
      read: () => getAdminSettings(),
    }),
    readTool({ name: "get_stripe_config", description: "Whether Stripe is on and configured, and its price ids. Never the keys.", read: () => getStripeConfig() }),
    readTool({ name: "get_discord_overview", description: "The Discord integration and bot state.", read: () => getDiscordOverview() }),
    ...llmReadTools(),
    ...communityReadTools(),
  ]
}
