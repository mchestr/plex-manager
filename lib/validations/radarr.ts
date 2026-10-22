import { createServiceSchema, type ServiceInput, type ServiceParsed } from "./shared-schemas"

export const radarrSchema = createServiceSchema({ defaultPort: "7878", publicExample: "radarr.example.com" })

export type RadarrInput = ServiceInput
export type RadarrParsed = ServiceParsed
