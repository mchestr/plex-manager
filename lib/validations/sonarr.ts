import { createServiceSchema, type ServiceInput, type ServiceParsed } from "./shared-schemas"

export const sonarrSchema = createServiceSchema({ defaultPort: "8989", publicExample: "sonarr.example.com" })

export type SonarrInput = ServiceInput
export type SonarrParsed = ServiceParsed
