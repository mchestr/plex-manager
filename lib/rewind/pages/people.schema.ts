import { z } from "zod"

/**
 * 08 People: how many actors and directors the billing block prints. The
 * names are the `people.actor[n].name` and `people.director[n].name` facts;
 * directors come from films only.
 */
export const PeopleDataSchema = z
  .strictObject({
    actors: z.number().int().min(0).max(5),
    directors: z.number().int().min(0).max(3),
  })
  .refine((data) => data.actors + data.directors > 0, { message: "The block names someone" })

export type PeopleData = z.infer<typeof PeopleDataSchema>
