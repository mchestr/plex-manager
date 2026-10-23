import { createServiceSchema, type ServiceInput, type ServiceParsed } from "./shared-schemas"

export const overseerrSchema = createServiceSchema({ defaultPort: "5055", publicExample: "requests.example.com" })

/** @internal The form shape; the validation tests type their fixtures with it. */
export type OverseerrInput = ServiceInput
export type OverseerrParsed = ServiceParsed
