import { z } from "zod"

/** An invite code as a member types or follows it; the lookup is exact. */
export const inviteCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid invite code")
