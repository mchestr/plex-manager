import "server-only"

import { isRecord } from "./arr-output"

/**
 * Paths in a Sonarr or Radarr message cut to their last part, for the shared
 * Discord channel: "No files found are eligible for import in C:\Users\Jane
 * Doe\Downloads\Show.S01" becomes "No files found are eligible for import in
 * …/Show.S01", so no user profile, share or mount reaches it.
 *
 * ## How
 *
 * 1. A path the message is known to name, a queue item's `outputPath`, is
 *    cut wherever it appears, whatever spaces it holds. Sonarr and Radarr
 *    name it in their own warnings ("No files found are eligible for import
 *    in {path}", "[{path}] is not a valid local path", "...: {path}. Ensure
 *    the path exists").
 * 2. Any other absolute path (Unix, Windows or UNC) is found by its shape: a
 *    root ("/", "C:\", "\\" or "//") at the start or after a space, bracket,
 *    quote or "=", then each directory and its separator. A directory name
 *    may hold spaces, so it ends only at what a name rarely holds: a quote, a
 *    bar, "]", a line break, "://", a space before another root, or ". " or
 *    ", " with a space after it before the next separator (a sentence goes on
 *    "...Show.S01. Ensure the path exists"; a name such as "J. Smith\" or
 *    "Smith, John\" does not).
 *
 * ## Special cases
 *
 * - Text after a path that holds a separator with none of those before it
 *   ("...: /downloads/Show Ensure ... this file/folder") reads as part of the
 *   path and is cut with it, unless step 1 found the path: text is lost,
 *   never a directory shown.
 * - A name with ". " and more words before its separator ("C:\Users\J. R.
 *   Smith\Downloads") reads by shape as a sentence after "C:\Users\", so it
 *   shows with what follows it ("…/J. R. Smith\Downloads"); step 1 still
 *   finds a queue item's own folder whole, whatever its names hold.
 * - A "/" alone ("5 MB / s") is not a path, and a separator that ends one
 *   stays with its last part ("…/tv/, …/anime/").
 *
 * @module
 */

/** A root: a drive ("C:\" or "C:/"), a UNC or doubled root ("\\" or "//"), or "/". */
const ROOT = String.raw`(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)`
/** A character a directory name can hold: anything but a separator, a quote, a bar, "]" or a line break. */
const NAME = String.raw`[^\\/'"|\]\n]`
/** Where a name ends although it could go on: ". " or ", " before more words, "://", or a space before another root. */
const STOP = String.raw`[.,]\s(?=[^\\/\n]*?\s)|:\/\/|\s(?:[A-Za-z]:)?[\\/]`
/** The start of a path's last part: a name character that is not a space and does not end a name. */
const LAST = String.raw`(?!\.\s|,\s)[^\s\\/'"|\]]`

/** An absolute path's root and directories, up to its last part, where a path can start. */
const PATH_DIRECTORIES = new RegExp(String.raw`(?<=^|[\s[('"=])${ROOT}(?=${LAST})(?:(?:(?!${STOP})${NAME})*[\\/](?=${NAME}))*(?=${LAST})`, "g")

/** An absolute path below its root ("C:\Downloads", not "C:\" or "Downloads"). */
const BELOW_ROOT = new RegExp(String.raw`^${ROOT}[^\s\\/]`)

/**
 * `message` with every absolute path cut to its last part ("…/Show.S01").
 * `known` is a path the message may name with spaces in it, a queue item's
 * `outputPath`; it is cut first, wherever it appears.
 */
export function withoutPaths(message: string, known?: string): string {
  const path = known?.replace(/[\\/]+$/, "")
  const last = path !== undefined && BELOW_ROOT.test(path) ? path.split(/[\\/]/).pop() : undefined
  const named = path !== undefined && last !== undefined ? message.replaceAll(path, () => `…/${last}`) : message
  return named.replace(PATH_DIRECTORIES, "…/")
}

/**
 * Health checks as Sonarr and Radarr send them, each `message` without its
 * paths ("Missing root folder: …/tv"), for `get_*_status` in Discord, where
 * every member may ask. Anything but a list of checks is none.
 */
export function healthWithoutPaths(checks: unknown): unknown[] {
  if (!Array.isArray(checks)) return []
  return checks.map((check) => (isRecord(check) && typeof check.message === "string" ? { ...check, message: withoutPaths(check.message) } : check))
}
