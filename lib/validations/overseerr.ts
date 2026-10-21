import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const overseerrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("5055"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("requests.example.com"),
})

export type OverseerrInput = z.input<typeof overseerrSchema>
export type OverseerrParsed = z.output<typeof overseerrSchema>
