/**
 * Roles and permissions: what a signed-in user may do beyond being a member.
 *
 * ## Overview
 *
 * `User.isAdmin` stays the superuser: it holds every permission. A non-admin
 * may also hold one built-in role in `User.role` (today only `support`), and a
 * role is a fixed list of permissions defined here, so adding a role or a
 * permission needs no schema change.
 *
 * ```
 * subject { isAdmin, role }
 *   isAdmin            -> every permission
 *   role = "support"   -> ROLES.support.permissions
 *   anything else      -> none (an unknown stored role fails closed)
 * ```
 *
 * The module has no server-only imports, so the proxy, the session callbacks
 * and client components can use it.
 *
 * @module lib/permissions
 */

import { z } from "zod"

/** @internal */
export const PERMISSIONS = [
  /** Open the admin assistant. */
  "assistant:use",
  /** Assistant tools that only read. */
  "assistant:tools:read",
  /** Assistant tools that change data (media marking, anything that deletes or reconfigures). */
  "assistant:tools:write",
  /** Assistant tools over admin-only data and connections (app data, the knowledge base, MCP servers). */
  "assistant:tools:admin",
  /** The users list in the admin area. */
  "users:read",
  /** The admin Affiliates page without codes, labels, the block list or settings; decides nothing. */
  "affiliates:read",
  /** The admin Audit log: who did what and when. The stored details of an event stay admin-only. */
  "audit:read",
] as const

export type Permission = (typeof PERMISSIONS)[number]

interface RoleDefinition {
  label: string
  description: string
  permissions: readonly Permission[]
}

/**
 * The built-in roles. Admin is not a role: it is `User.isAdmin`.
 *
 * @internal
 */
export const ROLES = {
  support: {
    label: "Support",
    description:
      "Troubleshoots with the assistant's read-only tools and sees the users list, affiliates and the audit log. No settings, secrets or changes.",
    permissions: ["assistant:use", "assistant:tools:read", "users:read", "affiliates:read", "audit:read"],
  },
} as const satisfies Record<string, RoleDefinition>

export type RoleKey = keyof typeof ROLES

/** @internal */
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[]

export const roleKeySchema = z.enum(ROLE_KEYS as [RoleKey, ...RoleKey[]])

/** What a permission check reads off a user or session. */
export interface PermissionSubject {
  isAdmin: boolean
  role?: string | null
}

/** The stored role as a known key, or null for none or an unknown value. */
export function parseRole(value: unknown): RoleKey | null {
  const parsed = roleKeySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Every permission the subject holds. */
export function permissionsFor(subject: PermissionSubject | null | undefined): ReadonlySet<Permission> {
  if (!subject) return new Set()
  if (subject.isAdmin) return new Set(PERMISSIONS)
  const role = parseRole(subject.role)
  return new Set(role ? ROLES[role].permissions : [])
}

/** Whether the subject holds `permission`; false without a subject. */
export function hasPermission(subject: PermissionSubject | null | undefined, permission: Permission): boolean {
  return permissionsFor(subject).has(permission)
}

/** Whether the subject may enter the admin area: an admin, or a role holding `assistant:use` or `users:read`. */
export function canEnterAdminArea(subject: PermissionSubject | null | undefined): boolean {
  return hasPermission(subject, "assistant:use") || hasPermission(subject, "users:read")
}
