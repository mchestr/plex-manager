/**
 * The request's NextAuth session, read once per server render (P11.19,
 * BP-31). Every guard, layout, page and loader calls {@link getSession}
 * instead of `getServerSession(authOptions)`, so a page that runs three guards
 * decodes the JWT and checks revocation once.
 *
 * React `cache()` scopes the memo to one render. Outside a render (a Server
 * Action, a route handler) each call reads the session again, which is what an
 * action that changes the session needs.
 *
 * Never call it inside `'use cache'`: the session is the viewer's, and a
 * cached scope is shared between viewers.
 *
 * Inside an MCP tool call it returns the token owner's session
 * (`lib/mcp/principal.ts`), so the same guards check an MCP caller.
 *
 * @module lib/data/session
 */

import "server-only"

import { getServerSession } from "next-auth"
import { cache } from "react"

import { authOptions } from "@/lib/auth"
import { principalSession } from "@/lib/mcp/principal"

export const getSession = cache(async () => principalSession() ?? getServerSession(authOptions))
