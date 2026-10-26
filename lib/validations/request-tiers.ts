import { z } from "zod"

import { requestTiersSchema } from "@/lib/request-tiers/tiers"

/** The admin's request-limit tier settings: the switch, the hour it runs and the tier table. */
export const requestTierSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Hour of the day, in the server zone. */
  runHour: z.number().int().min(0).max(23),
  tiers: requestTiersSchema,
})
