/**
 * The issue's acts as the desktop spread shows them (design 4.2, 4.7): the
 * act tabs, the grouped progress and the contents rail all read these.
 *
 * @module lib/rewind/stage/acts
 */

import { registry, type Act, type IssuePageType } from "@/lib/rewind/registry"

const ACT_LABELS: Record<Act, string> = {
  front: "Front",
  features: "Features",
  habits: "Habits",
  server: "Server",
  centrefold: "Centrefold",
  back: "Back",
}

export interface ActGroup {
  act: Act
  label: string
  /** Indexes into the selected page list, in order. */
  pages: number[]
}

/**
 * The selected pages grouped by act, in issue order; an act with no
 * selected page has no group, so its tab never shows.
 *
 * @example
 * ```ts
 * actGroups(["cover", "number", "top-shows", "centrefold", "back-cover"]).map((g) => [g.label, g.pages])
 * // [["Front", [0, 1]], ["Features", [2]], ["Centrefold", [3]], ["Back", [4]]]
 * ```
 */
export function actGroups(types: readonly IssuePageType[]): ActGroup[] {
  const groups: ActGroup[] = []
  types.forEach((type, index) => {
    const act = registry[type].act
    const last = groups.at(-1)
    if (last?.act === act) last.pages.push(index)
    else groups.push({ act, label: ACT_LABELS[act], pages: [index] })
  })
  return groups
}
