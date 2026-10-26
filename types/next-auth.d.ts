import "next-auth"
import "next-auth/jwt"

import type { AccessLevel } from "@/lib/access"
import type { RoleKey } from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      isAdmin: boolean
      /** A built-in non-admin role (`lib/permissions`), or null. */
      role?: RoleKey | null
    }
  }

  interface User {
    id: string
    isAdmin: boolean
    role?: RoleKey | null
    /** `User.sessionVersion` at sign-in, stored in the JWT as `sv`. */
    sessionVersion: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isAdmin: boolean
    role?: RoleKey | null
    /** Epoch ms of the last time isAdmin was refreshed from the database. */
    checkedAt?: number
    /**
     * The `User.sessionVersion` the token was issued under. A token without it
     * (issued before P4.7) counts as version 0.
     */
    sv?: number
    /**
     * `getAccessLevel` at sign-in and at each periodic recheck, for
     * `proxy.ts` (P4.5). Absent on tokens issued before P4.5.
     */
    accessLevel?: AccessLevel
  }
}
