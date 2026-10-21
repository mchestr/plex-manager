import { z } from "zod"

/** The shares Setup draws as meters, in page order. */
export const SETUP_METERS = ["setup.directPlayShare", "setup.homeShare", "setup.fourKShare"] as const

/**
 * 13 Setup: the meters the page draws, as fact ids, each above 0%. The
 * shares, the platform and the product are facts (`setup.*`); nothing here
 * can name a player, an address or a device id.
 */
export const SetupDataSchema = z.strictObject({
  meters: z.array(z.enum(SETUP_METERS)).max(SETUP_METERS.length),
})

export type SetupData = z.infer<typeof SetupDataSchema>
