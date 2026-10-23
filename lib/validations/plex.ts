import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const plexServerSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("32400"),
  token: z.string().min(1, "Plex token is required"),
  publicUrl: createPublicUrlSchema("plex.example.com"),
})

/** @internal The form shape; the validation tests type their fixtures with it. */
export type PlexServerInput = z.input<typeof plexServerSchema>
export type PlexServerParsed = z.output<typeof plexServerSchema>

