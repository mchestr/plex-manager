import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

/** The box score's cells, in catalogue order (design 4.3 page 12). */
export const RECORD_CELLS = ["binge", "day", "week", "completion", "paused", "latest"] as const

const RecordCellSchema = z.enum(RECORD_CELLS)

export type RecordCell = z.infer<typeof RecordCellSchema>

/**
 * 12 Records: the 2 to 4 cells the box score prints, in catalogue order,
 * the cell the "record" stamp marks, and what no fact holds: the most-paused
 * title's paused minutes and the keys of the titles a cell names (so a
 * hidden title leaves the share projection). Every other number is a fact.
 */
export const RecordsDataSchema = z
  .strictObject({
    cells: z.array(RecordCellSchema).min(2).max(4),
    stamp: RecordCellSchema.nullable(),
    pausedMinutes: z.number().int().positive().nullable(),
    bingeKey: TitleKeySchema.nullable(),
    pausedKey: TitleKeySchema.nullable(),
  })
  .refine((data) => new Set(data.cells).size === data.cells.length && (data.stamp === null || data.cells.includes(data.stamp)), {
    message: "Cells are distinct and the stamp marks one of them",
    path: ["stamp"],
  })
  .refine((data) => data.cells.includes("paused") === (data.pausedMinutes !== null), {
    message: "The paused minutes come with the paused cell",
    path: ["pausedMinutes"],
  })

export type RecordsData = z.infer<typeof RecordsDataSchema>
