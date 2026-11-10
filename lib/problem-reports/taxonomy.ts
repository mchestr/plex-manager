/**
 * What a member can report about a title: the problems, the kind each one
 * belongs to, the words members see, and the fix each one points to.
 *
 * ## Overview
 *
 * The web sheet and Discord ask two questions: the kind (step 1), then the
 * problem (step 2). The admin pages label reports with the same words. The
 * suggested fix is where a problem leads once the checks in
 * `docs/problem-reports.md` have run; until those land, every report goes to
 * the server admin.
 *
 * | Kind          | Problems                                              | Fix            |
 * |---------------|-------------------------------------------------------|----------------|
 * | `playback`    | won't start, stops, glitches, out of sync, no sound   | SWAP           |
 * |               | buffers                                               | ADMIN          |
 * | `picture`     | blurry                                                | BETTER_COPY    |
 * |               | filmed off a screen, subtitles stuck on               | SWAP           |
 * | `language`    | wrong language, subtitles missing or out of sync      | ADMIN          |
 * | `wrong_title` | a different title plays                               | FIX_MATCH      |
 * |               | wrong title, poster or description                    | REFRESH        |
 * | `episodes`    | missing episodes (shows only)                         | LOOK_FOR_MISSING |
 * |               | episodes in the wrong order (shows only)              | ADMIN          |
 * | `other`       | something else, with a note                           | ADMIN          |
 *
 * Problem codes are stored on reports, so a code is never renamed; a retired
 * one reads as "Something else" ({@link problemLabel}).
 *
 * @module
 */

/** The first question: what kind of problem. */
export type ProblemKind = "playback" | "picture" | "language" | "wrong_title" | "episodes" | "other"

/** Where a problem leads once the checks have run. */
type SuggestedFix = "SWAP" | "BETTER_COPY" | "LOOK_FOR_MISSING" | "FIX_MATCH" | "REFRESH" | "ADMIN"

/** The Plex types a report can be about, and the `MediaType` each is stored as. */
export const REPORTABLE_MEDIA_TYPES = { movie: "MOVIE", show: "TV_SERIES", episode: "EPISODE" } as const

/** The type of title a report is about, as Plex names it. */
export type ReportableType = keyof typeof REPORTABLE_MEDIA_TYPES

interface Problem {
  kind: ProblemKind
  label: string
  fix: SuggestedFix
}

/** Step 1's rows, in order. `episodes` only appears for shows and episodes. */
export const PROBLEM_KINDS: readonly { id: ProblemKind; label: string }[] = [
  { id: "playback", label: "It won't play properly" },
  { id: "picture", label: "The picture is poor" },
  { id: "language", label: "Wrong language or subtitles" },
  { id: "wrong_title", label: "It's the wrong title" },
  { id: "episodes", label: "Episodes are missing or out of order" },
  { id: "other", label: "Something else" },
]

/** Every problem, by its stored code, in the order step 2 lists them. */
export const PROBLEMS = {
  wont_start: { kind: "playback", label: "Won't start", fix: "SWAP" },
  stops: { kind: "playback", label: "Stops or freezes partway", fix: "SWAP" },
  glitches: { kind: "playback", label: "Glitches or looks corrupted", fix: "SWAP" },
  out_of_sync: { kind: "playback", label: "Sound is out of sync", fix: "SWAP" },
  no_sound: { kind: "playback", label: "No sound, or the sound cuts out", fix: "SWAP" },
  buffers: { kind: "playback", label: "Buffers a lot", fix: "ADMIN" },
  blurry: { kind: "picture", label: "Blurry or low quality", fix: "BETTER_COPY" },
  filmed_off_screen: { kind: "picture", label: "Looks filmed off a screen", fix: "SWAP" },
  stuck_subtitles: { kind: "picture", label: "Subtitles are stuck on and won't turn off", fix: "SWAP" },
  wrong_language: { kind: "language", label: "The sound is in the wrong language", fix: "ADMIN" },
  subtitles_missing: { kind: "language", label: "Subtitles are missing", fix: "ADMIN" },
  subtitles_out_of_sync: { kind: "language", label: "Subtitles are out of sync", fix: "ADMIN" },
  different_title: { kind: "wrong_title", label: "A different movie or episode plays", fix: "FIX_MATCH" },
  wrong_details: { kind: "wrong_title", label: "The title, poster or description is wrong", fix: "REFRESH" },
  missing_episodes: { kind: "episodes", label: "Episodes are missing", fix: "LOOK_FOR_MISSING" },
  wrong_order: { kind: "episodes", label: "Episodes are in the wrong order", fix: "ADMIN" },
  other: { kind: "other", label: "Something else", fix: "ADMIN" },
} as const satisfies Record<string, Problem>

export type ProblemCode = keyof typeof PROBLEMS

/** Playback problems that ask "Does anything else play on {player}?" when the member's last player is known. */
const ASKS_DEVICE: ReadonlySet<ProblemCode> = new Set(["wont_start", "stops", "glitches", "out_of_sync", "no_sound"])

/** Picture problems that first say a converted play lowers quality, when the member's last play was converted. */
const TRANSCODE_TIP: ReadonlySet<ProblemCode> = new Set(["blurry", "glitches"])

/** Every code, for `z.enum`. */
export const PROBLEM_CODES = Object.keys(PROBLEMS) as [ProblemCode, ...ProblemCode[]]

/** The problems of one kind, in order. */
export function problemsOf(kind: ProblemKind): { code: ProblemCode; label: string }[] {
  return PROBLEM_CODES.filter((code) => PROBLEMS[code].kind === kind).map((code) => ({ code, label: PROBLEMS[code].label }))
}

/** Step 1's rows for a title: episode problems only for shows and episodes. */
export function kindsFor(type: ReportableType): readonly { id: ProblemKind; label: string }[] {
  return type === "movie" ? PROBLEM_KINDS.filter((kind) => kind.id !== "episodes") : PROBLEM_KINDS
}

/** Whether the sheet asks if anything else plays on the member's player. */
export function asksDevice(code: ProblemCode): boolean {
  return ASKS_DEVICE.has(code)
}

/** Whether the sheet explains a converted play before sending. */
export function showsTranscodeTip(code: ProblemCode): boolean {
  return TRANSCODE_TIP.has(code)
}

/** Whether the member must say what's wrong in a note. */
export function needsNote(code: ProblemCode): boolean {
  return code === "other"
}

/** A stored code's words; a code no longer in the taxonomy reads as "Something else". */
export function problemLabel(code: string): string {
  return code in PROBLEMS ? PROBLEMS[code as ProblemCode].label : PROBLEMS.other.label
}
