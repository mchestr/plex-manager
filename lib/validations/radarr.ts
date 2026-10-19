import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const radarrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("7878"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("radarr.example.com"),
})

export type RadarrInput = z.input<typeof radarrSchema>
export type RadarrParsed = z.output<typeof radarrSchema>
