import { z } from "zod"

/** An invite code as a member types or follows it; the lookup is exact. */
export const inviteCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid invite code")

/** The create-invite dialog's expiry options; `createInvite` accepts only these. */
export const EXPIRES_IN_OPTIONS = ["1d", "48h", "7d", "30d", "never"] as const

export type ExpiresIn = (typeof EXPIRES_IN_OPTIONS)[number]
