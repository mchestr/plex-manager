import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

/**
 * One answer the quiz offers: its title's key (the poster and the answer),
 * its title as the lists print it, and its rank among the candidates by
 * minutes (1 is the answer). `minutes` is the fact holding its watch time,
 * shown on the reveal; null for a film outside the top five.
 */
const QuizOptionSchema = z.strictObject({
  key: TitleKeySchema,
  title: z.string().min(1),
  rank: z.number().int().min(1).max(4),
  minutes: z
    .string()
    .regex(/^(?:series|films)\[[1-5]\]\.minutes$/)
    .nullable(),
})

/**
 * 04 Guess: the question's kind (`series`, or `mixed` films and series with
 * fewer than 3 series) and its 3 or 4 options in their shuffled order, which
 * is stored so a member always sees the same order.
 */
export const GuessDataSchema = z.strictObject({
  kind: z.enum(["series", "mixed"]),
  options: z.array(QuizOptionSchema).min(3).max(4),
})

export type GuessData = z.infer<typeof GuessDataSchema>
export type QuizOption = GuessData["options"][number]
