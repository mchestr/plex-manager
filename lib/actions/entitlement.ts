/**
 * Entitlement checks for Server Actions, route handlers and pages (SEC-28).
 *
 * `full` needs an entitled member; `read` also accepts a `lapsed` member, who
 * keeps their stored Rewinds (FR-51). Admins pass through
 * {@link getAccessLevel}, which reports them `full` unless they are disabled.
 * The level is read once per request through React `cache()`.
 *
 * @module lib/actions/entitlement
 */

import "server-only"

import { cache } from "react"

import { getAccessLevel, type AccessLevel } from "@/lib/access"

/** What a surface needs: an active membership, or read access to stored Rewinds. */
export type Entitlement = "full" | "read"

export const NOT_ENTITLED_MESSAGE = "This needs an active membership."

/** {@link getAccessLevel}, read once per request. */
export const requestAccessLevel = cache(getAccessLevel)

/** Whether `level` meets `required`. */
function meetsEntitlement(level: AccessLevel, required: Entitlement): boolean {
  return level === "full" || (required === "read" && level === "lapsed")
}

/** Whether the user `userId` meets `required`, read once per request. */
export async function hasEntitlement(userId: string, required: Entitlement): Promise<boolean> {
  return meetsEntitlement(await requestAccessLevel(userId), required)
}
