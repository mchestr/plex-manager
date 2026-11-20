/**
 * Telling whether two paths are the same file when Plex and Radarr or Sonarr
 * see the same disk under different roots (containers): by file name and the
 * name of its folder, compared without case, never by whole path, with size
 * to tell apart files that still tie (docs/problem-reports.md, "The file a
 * fix acts on").
 *
 * @module lib/problem-reports/file-match
 */

/** A path's file name and folder name, lower case, whichever separator it uses. */
export function nameAndFolder(path: string): { name: string; folder: string | null } {
  const segments = path.split(/[\\/]+/).filter(Boolean)
  return { name: (segments.at(-1) ?? "").toLowerCase(), folder: segments.at(-2)?.toLowerCase() ?? null }
}

/** The folder part of a path as written, without its last separator. */
export const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")))

/**
 * The files among `files` that are the Plex file: same name and folder name,
 * then the same size when several are.
 */
export function matchFile<T extends { path: string; size: number | null }>(plexFile: { file: string; size?: number }, files: readonly T[]): T | null {
  const plex = nameAndFolder(plexFile.file)
  const named = files.filter((file) => {
    const candidate = nameAndFolder(file.path)
    return candidate.name === plex.name && candidate.folder === plex.folder
  })
  const matches = named.length > 1 ? named.filter((file) => file.size === plexFile.size) : named
  return matches.length === 1 ? matches[0] : null
}
