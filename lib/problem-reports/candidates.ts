/**
 * Which release a swap grabs, from an interactive search's results
 * (docs/problem-reports.md, "Swap the copy"). Pure: the step reads the
 * releases, the file and the bad release, and this decides.
 *
 * ## The rules
 *
 * A candidate must be:
 * 1. another release than the bad one: not its title (the grab's or the
 *    file's scene name, compared without case) and not its info hash;
 * 2. unrejected, rejected only by checks starting "Existing file" (Radarr
 *    and Sonarr reject anything that isn't an upgrade while a file is there,
 *    which a swap means to replace anyway), or held back only for now
 *    (`temporarilyRejected`, a delay);
 * 3. at least as good as the file, so the import is accepted in place: a
 *    quality the profile ranks at least as high (a group's qualities rank the
 *    same), the same quality's revision at least as high, and a custom format
 *    score at least the file's;
 * 4. in the file's languages, where the file's are known;
 * 5. for Sonarr, exactly the file's episodes: no season pack, and no single
 *    episode for a double-episode file.
 *
 * The best has the highest custom format score, then quality, revision and
 * seeders. With none, the reason says whether lower-quality copies were all
 * there was.
 *
 * @module lib/problem-reports/candidates
 */

import type { ArrRelease } from "@/lib/connections/arr-swap"
import type { ArrQuality } from "@/lib/connections/arr-upgrade"

/** The file a swap replaces, as the rules compare it. */
export interface CandidateFile {
  quality: ArrQuality | null
  customFormatScore: number | null
  /** Language ids; 0 and below are "unknown" and ask nothing. */
  languages: number[]
  /** Sonarr: the file's episodes. */
  episodeIds: number[]
}

/** The release behind the bad file: its titles, and its info hash when it was a torrent. */
export interface BadRelease {
  titles: string[]
  infoHash: string | null
}

export type CandidatePick = { ok: true; release: ArrRelease } | { ok: false; reason: "NO_OTHER_COPY" | "ONLY_LOWER" }

const EXISTING_FILE = "Existing file"

/** A quality's place in the profile, worst first; -1 for one the profile doesn't have. */
function rank(order: readonly number[][], qualityId: number): number {
  return order.findIndex((group) => group.includes(qualityId))
}

/** Compares two releases or files by quality, then revision: positive when `a` is better. */
function compareQuality(order: readonly number[][], a: ArrQuality, b: ArrQuality): number {
  return rank(order, a.id) - rank(order, b.id) || a.version - b.version || a.real - b.real
}

const isOther = (bad: BadRelease) => {
  const titles = new Set(bad.titles.map((title) => title.toLowerCase()))
  return (release: ArrRelease) => !titles.has(release.title.toLowerCase()) && !(bad.infoHash && release.infoHash === bad.infoHash.toLowerCase())
}

const isAllowed = (release: ArrRelease) =>
  !release.rejected || release.temporarilyRejected || (release.rejections.length > 0 && release.rejections.every((rejection) => rejection.startsWith(EXISTING_FILE)))

function fits(release: ArrRelease, file: CandidateFile, service: "radarr" | "sonarr"): boolean {
  const wanted = file.languages.filter((id) => id > 0)
  if (!wanted.every((id) => release.languages.includes(id))) return false
  if (service === "radarr") return true
  const episodes = new Set(file.episodeIds)
  return release.episodeIds !== null && release.episodeIds.length === episodes.size && release.episodeIds.every((id) => episodes.has(id))
}

function isAsGood(release: ArrRelease, file: CandidateFile, order: readonly number[][]): boolean {
  if (rank(order, release.quality.id) < 0) return false
  if (file.quality && compareQuality(order, release.quality, file.quality) < 0) return false
  return release.customFormatScore >= (file.customFormatScore ?? 0)
}

/**
 * The release to grab instead of the file, or why there is none.
 *
 * @param order - The quality profile's qualities from worst to best (`ArrQualityProfile.qualityOrder`)
 */
export function pickCandidate(releases: readonly ArrRelease[], file: CandidateFile, bad: BadRelease, order: readonly number[][], service: "radarr" | "sonarr"): CandidatePick {
  const possible = releases.filter(isOther(bad)).filter(isAllowed).filter((release) => fits(release, file, service))
  const good = possible.filter((release) => isAsGood(release, file, order))
  if (good.length === 0) return { ok: false, reason: possible.length > 0 ? "ONLY_LOWER" : "NO_OTHER_COPY" }
  const [best] = [...good].sort(
    (a, b) => b.customFormatScore - a.customFormatScore || compareQuality(order, b.quality, a.quality) || (b.seeders ?? 0) - (a.seeders ?? 0)
  )
  return { ok: true, release: best }
}
