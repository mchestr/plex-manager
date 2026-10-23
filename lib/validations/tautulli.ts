import { z } from "zod"

import { createServiceSchema, type ServiceInput, type ServiceParsed } from "./shared-schemas"

export const tautulliSchema = createServiceSchema({ defaultPort: "8181", publicExample: "tautulli.example.com" })

/** @internal The form shape; the validation tests type their fixtures with it. */
export type TautulliInput = ServiceInput
export type TautulliParsed = ServiceParsed

/**
 * Every Tautulli v2 response: `{ response: { result, message, data } }`. It
 * is lenient on purpose (`looseObject`), so a Tautulli upgrade cannot crash a
 * caller; P2.4 owns the strict history row.
 *
 * Based on https://docs.tautulli.com/extending-tautulli/api-reference
 */
export const tautulliEnvelopeSchema = z.looseObject({
  response: z.looseObject({
    result: z.string(),
    message: z.string().nullish(),
    data: z.unknown().optional(),
  }),
})
