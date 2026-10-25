import "server-only"

import { type RegisteredTool } from "./types"

/**
 * Read-only tools over the app's own admin data. None is `discordSafe`: they
 * read every member's data, so the Discord context refuses them.
 */
export const APP_DATA_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    function: {
      name: "get_app_invites",
      description:
        "List this app's invites by status (active, expired, usedUp or all), optionally only those that expire within a number of days. Returns code, server type, uses, expiry.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "expired", "usedUp", "all"], description: "Default active" },
          expiresWithinDays: { type: "integer", description: "Only invites that expire within this many days, e.g. 7" },
          limit: { type: "integer", description: "Maximum invites to return (default 20, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_member",
      description:
        "Look up one member of this app by name, email or user id: services, disabled/exempt state, subscription and access status, the latest Rewind status and the most recent Rewind generation runs with their errors. Use it to diagnose a member's Plex access, subscription or failed Rewind.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name, email or user id" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_failed_jobs",
      description:
        "List the newest failed background jobs (Rewind generation, Stripe access, watchlist sync, retention) with their error and attempts.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", description: "Maximum jobs to return (default 10, max 25)" } },
      },
    },
  },
]
