import { z } from "zod"

export const TitleKeySchema = z.string().regex(/^(?:film|series):[^\s]+$/)

/**
 * One bookend: its title's key (the list key and, later, the poster), and
 * whether it is the No. 1 series, which the page masks to protect the quiz.
 */
const BookendSchema = z.strictObject({ key: TitleKeySchema, masked: z.boolean() })

/** 03 Bookends: the title, date and time of each end are facts (`bookends.first.*`, `bookends.last.*`). */
export const BookendsDataSchema = z.strictObject({ first: BookendSchema, last: BookendSchema })

export type BookendsData = z.infer<typeof BookendsDataSchema>
