import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const sonarrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("8989"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("sonarr.example.com"),
})

export type SonarrInput = z.input<typeof sonarrSchema>
export type SonarrParsed = z.output<typeof sonarrSchema>
