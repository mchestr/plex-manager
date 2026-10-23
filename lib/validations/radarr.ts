import { createServiceSchema, type ServiceParsed } from "./shared-schemas"

export const radarrSchema = createServiceSchema({ defaultPort: "7878", publicExample: "radarr.example.com" })

export type RadarrParsed = ServiceParsed
