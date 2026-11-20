/**
 * The path fence (TS 7.4, E18): a title can be deleted only when Plex and the
 * arr app see the same files, inside the arr app's folders. No path map in
 * v1. Pure and client-safe.
 *
 * `isInside(child, parent)`:
 *
 * 1. Normalise both: collapse `//`, strip one trailing `/`. A path with a `.`
 *    or `..` segment, or without a leading `/`, is not inside anything.
 * 2. True when `child === parent` or `child` starts with `parent + "/"`. The
 *    compare is case-sensitive, so `/data/movies4k/a.mkv` is not inside
 *    `/data/movies`.
 *
 * `isStrictlyInside` is the same, but equal paths are false. The fence uses it
 * for an arr path against a root folder: for a record whose path equals its
 * root folder, Radarr and Sonarr keep the files but still remove the record.
 *
 * | Level | Passes when |
 * |---|---|
 * | Movie | the arr movie `path` is strictly inside a root folder, and every `Part.file` of the Plex copy is inside it |
 * | Show | the series `path` is strictly inside a root folder, and every episode `Part.file` of the Plex show copy is inside it |
 * | Season | the show passes, the season numbering check passes, and every episode file of the season copy is inside the series `path` |
 *
 * Causes: `outsideRoot` (the arr path is outside the roots, or equal to one),
 * `outsideArrPath` (a Plex file is outside the arr path), `noPlexFile` (no
 * `Part`). The managed copy is the copy that passes; of two, the lowest
 * section id. With none, the first copy by section id stands in.
 *
 * @module lib/cleanup/identity/path-fence
 */

export type FenceCause = "outsideRoot" | "outsideArrPath" | "noPlexFile"

/** The normal form of an absolute path, or null when the path can never be inside anything. */
export function normalisePath(path: string): string | null {
  if (!path.startsWith("/")) return null
  let normal = path.replace(/\/{2,}/g, "/")
  if (normal.length > 1 && normal.endsWith("/")) normal = normal.slice(0, -1)
  return normal.split("/").some((segment) => segment === "." || segment === "..") ? null : normal
}

/** Whether `child` is `parent` or inside it (TS 7.4). */
export function isInside(child: string, parent: string): boolean {
  const c = normalisePath(child)
  const p = normalisePath(parent)
  if (c === null || p === null) return false
  return c === p || c.startsWith(p === "/" ? "/" : `${p}/`)
}

/** Whether `child` is inside `parent` and not `parent` itself. @internal */
export function isStrictlyInside(child: string, parent: string): boolean {
  return isInside(child, parent) && normalisePath(child) !== normalisePath(parent)
}

/** The root folder that strictly holds `path` (the longest one), or null: the arr path is `outsideRoot`. */
export function rootOf(path: string, roots: readonly string[]): string | null {
  let best: string | null = null
  for (const root of roots) {
    if (isStrictlyInside(path, root) && (best === null || root.length > best.length)) best = root
  }
  return best
}

/** The fence of one Plex copy's files against the arr path: null when it passes. */
export function fenceFiles(files: readonly string[], arrPath: string): FenceCause | null {
  if (files.length === 0) return "noPlexFile"
  return files.every((file) => isInside(file, arrPath)) ? null : "outsideArrPath"
}

/** Section ids are digits: compare them as numbers, then the rating keys. */
export function bySection(a: { sectionId: string; ratingKey: string }, b: { sectionId: string; ratingKey: string }): number {
  return Number(a.sectionId) - Number(b.sectionId) || Number(a.ratingKey) - Number(b.ratingKey)
}

export interface CopyChoice<C> {
  /** The managed copy, else the first copy by section id. */
  chosen: C
  /** Whether `chosen` passed the fence. */
  managed: boolean
  /** The fence cause of the first copy when no copy passed. */
  cause: FenceCause | null
}

/**
 * The managed copy of a title: the copy that passes `fence`, the lowest
 * section id first. With none, the first copy by section id and its cause.
 */
export function pickManagedCopy<C extends { sectionId: string; ratingKey: string }>(
  copies: readonly C[],
  fence: (copy: C) => FenceCause | null
): CopyChoice<C> {
  const sorted = [...copies].sort(bySection)
  for (const copy of sorted) if (fence(copy) === null) return { chosen: copy, managed: true, cause: null }
  return { chosen: sorted[0], managed: false, cause: fence(sorted[0]) }
}
