/**
 * The caller of an MCP request, for code that reads the session.
 *
 * `/api/mcp` has no NextAuth cookie: it verifies a bearer token
 * (`lib/mcp/tokens.ts`), builds the token owner's session from the database
 * and runs each tool inside {@link runAsPrincipal}. `getSession()` returns that
 * session first, so every action guard and `assertAdmin()` loader checks the
 * token owner exactly as it would check them in the browser.
 *
 * Only the MCP route sets it, after the token checks; nothing reads it from a
 * request.
 *
 * @module lib/mcp/principal
 */

import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import type { Session } from "next-auth"

const store = new AsyncLocalStorage<Session>()

/** Runs `fn` with `session` as the caller's session. */
export function runAsPrincipal<T>(session: Session, fn: () => T): T {
  return store.run(session, fn)
}

/** The MCP caller's session, or undefined outside an MCP tool call. */
export function principalSession(): Session | undefined {
  return store.getStore()
}
