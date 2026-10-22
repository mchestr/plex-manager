import { z } from "zod"

/** The community box's lines, in page order. */
export const COMMUNITY_LINES = [
  "community.hours",
  "community.topSeries",
  "community.busiestNight",
  "community.peakConcurrent",
  "community.requestsFulfilled",
  "community.titlesAdded",
] as const

/**
 * 15 Standing: the member's rank among the members who pressed play (their
 * solid mark on the strip; ties share the better rank), and the community
 * facts the box prints, as fact ids. The percentile and the member count are
 * facts (`standing.*`). In-app only: the share projection never reads it.
 */
export const StandingDataSchema = z.strictObject({
  rank: z.number().int().positive(),
  community: z.array(z.enum(COMMUNITY_LINES)).max(COMMUNITY_LINES.length),
})

export type StandingData = z.infer<typeof StandingDataSchema>
