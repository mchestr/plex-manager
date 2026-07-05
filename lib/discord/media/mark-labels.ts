import { MarkType } from "@/lib/generated/prisma/client"

/**
 * Human-readable label for a {@link MarkType}.
 *
 * Single source of truth shared by every mark surface (slash command replies,
 * the `!`-prefixed command flow, and the chatbot executor). Previously this
 * logic was duplicated as `getMarkTypeLabel` in the Discord command module and
 * `formatMarkType` in the chatbot executor.
 *
 * @param markType - The mark type to label.
 * @returns A title-cased, space-separated label (e.g. `"Finished Watching"`).
 */
export function getMarkTypeLabel(markType: MarkType): string {
  switch (markType) {
    case MarkType.FINISHED_WATCHING:
      return "Finished Watching"
    case MarkType.NOT_INTERESTED:
      return "Not Interested"
    case MarkType.KEEP_FOREVER:
      return "Keep Forever"
    case MarkType.REWATCH_CANDIDATE:
      return "Rewatch Candidate"
    case MarkType.POOR_QUALITY:
      return "Poor Quality"
    case MarkType.WRONG_VERSION:
      return "Wrong Version"
    default:
      return markType
  }
}
