import { z } from "zod"

/** A title's list key, `film:<ratingKey>` or `series:<grandparentRatingKey>`; `./title-key` reads its parts. */
export const TitleKeySchema = z.string().regex(/^(?:film|series):[^\s]+$/)
