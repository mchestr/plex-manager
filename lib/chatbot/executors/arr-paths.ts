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
 *    root ("/", "C:\", "\\" or "//") where a path can start, then each
 *    directory and its separator. Sonarr v4 and Radarr v5 send messages in
 *    the server's UI language, which puts a path right after other
 *    characters, so a path starts at the start or after a space, "[", "(",
 *    "=", a quote (', ", „, “, ”, ‘, ’, «, », 「, 」, 『, 』), a backtick, the
 *    fullwidth colon "：", a colon after CJK ("文件夹:/home/…") or "-" after a
 *    Hebrew letter ("ב-/home/…"). A drive also starts one after anything but
 *    an ASCII word character, ".", ":", "…" or a separator ("下载在C:\…"),
 *    and a root right after Han, Kana or Hangul does when its first name
 *    starts with an ASCII letter, digit, "_", "." or "-" and ends at a
 *    separator ("下载在/home/jane/Downloads中"). A root that no name follows
 *    ("`C:\`", "5 MB / s") is no path.
 * 3. A directory name may hold spaces, so it ends only at what a name rarely
 *    holds: a double quote (", „, “, ”, «, », 「, 」, 『, 』), a backtick, a
 *    bar, "]", a line break, "://", a space before another root, ". " or ", "
 *    with a space after it before the next separator (a sentence goes on
 *    "...Show.S01. Ensure the path exists"; a name such as "J. Smith\" or
 *    "Smith, John\" does not), or an apostrophe that closes a quote
 *    ("'…/Sonarr' is not writable"). An apostrophe stays in a name when a
 *    separator follows it before the next quote or line break ("James'
 *    Drive\", "'90s Movies\"), or past the quote that closes a quoted word
 *    ("Robert 'Bob' Smith\"), and when it stands between two letters, digits
 *    or "_" in any script ("Sean O'Brien", "Zoë's Media", "D'Ávila"), though
 *    not before Han, Kana or Hangul, whose particles follow a closing quote
 *    ("'…/Show'을"). Only one of those rules fits an apostrophe, so a name is
 *    read one way only, and the cut takes time linear in the message.
 *
 * ## Special cases
 *
 * - Text after a path that holds a separator with none of those before it
 *   ("...: /downloads/Show Ensure ... this file/folder") reads as part of the
 *   path and is cut with it, unless step 1 found the path: text is lost,
 *   never a directory shown.
 * - That includes a contraction after a path ("it's", "doesn't"), a closing
 *   quote with a separator after it, and two paths in typographic single
 *   quotes, since their apostrophes stay in a name: "write error in
 *   /data/usenet/Show.S01E01 (it's on a read-only mount; check the
 *   user/group)" becomes "write error in …/group)". This is the trade-off
 *   for apostrophes in names: text is lost, never a directory shown.
 * - A name with ". " and more words before its separator ("C:\Users\J. R.
 *   Smith\Downloads") reads by shape as a sentence after "C:\Users\", so it
 *   shows with what follows it ("…/J. R. Smith\Downloads"); step 1 still
 *   finds a queue item's own folder whole, whatever its names hold.
 * - A "/" alone ("5 MB / s") is not a path, and a separator that ends one
 *   stays with its last part ("…/tv/, …/anime/", "„…/tv/“").
 * - Words joined by "/" mostly stay as they are: "Serien-/Staffelfinale" (a
 *   "-" opens a path only after a Hebrew letter), "用户名/密码" and
 *   "秒/分/时/天" (after CJK, a root needs a first name that starts in ASCII
 *   and ends at a separator), and "`[EN]`/`[EN+--]`" (no name follows the
 *   root). ASCII words joined by "/" right after CJK ("格式/HEVC/AV1") read
 *   as a path and lose all but the last ("格式…/AV1").
 * - A root right after CJK whose first name does not start in ASCII
 *   ("下载在/影视/剧集中") reads as words joined by "/" and stays, so a folder
 *   at the root with a CJK name shows, with the folders below it. Folders at
 *   a root have ASCII names in practice (/home, /mnt, /volume1, \\NAS), and a
 *   drive is cut whatever its names hold.
 *
 * @module
 */

/** A root: a drive ("C:\" or "C:/"), a UNC or doubled root ("\\" or "//"), or "/". */
const ROOT = String.raw`(?:[A-Za-z]:[\\/]|[\\/]{2}|\/)`
/**
 * Han, Hiragana, Katakana and Hangul, with the marks they share ("ー", "々",
 * "、"): scripts that join words or particles without a space, so a path can
 * follow a word directly.
 */
const CJK = String.raw`\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}`
/** A backtick, which a template literal cannot hold as it is. */
const BACKTICK = "`"
/** What a root follows where a path starts (step 2). */
const OPENS = String.raw`^|[\s[('"=„“”‘’«»「」『』：${BACKTICK}]|[${CJK}]:|\p{Script=Hebrew}-`
/** Quotes that close a path as `"` does: the typographic double quotes and the corner brackets. */
const CLOSERS = "„“”«»「」『』"
/** Where a name or a last part ends: a separator, a quote, a closer, a backtick, a bar or "]". */
const ENDS = String.raw`\\/'"|\]${BACKTICK}${CLOSERS}`
/** A letter, digit or "_" in any script, or a combining mark on one ("Zoë" written with U+0308). */
const WORD_END = String.raw`[\p{L}\p{M}\p{N}_]`
/** A letter, digit or "_" that starts a word, but not in CJK, whose particles follow a closing quote ("'…/Show'을"). */
const WORD_START = String.raw`(?![${CJK}])[\p{L}\p{N}_]`
/**
 * What follows an apostrophe that stays in a name wherever it stands: a
 * separator before the next quote or line break ("James' Drive\"), or one
 * past the quote that closes a quoted word, before any other ("Robert 'Bob'
 * Smith\"). A quote after a space opens one ("'…/Show' and '/backup'"), so
 * it closes no quoted word.
 */
const SEPARATOR_AHEAD = String.raw`[^'"\n\\/]*(?:(?<!\s)'[^'"\n\\/]*)?[\\/]`
/**
 * A character a directory name can hold (step 3): anything but those that end
 * one and a line break; an apostrophe with a separator after it before the
 * next quote or line break, or else one between two word characters. The two
 * apostrophe rules never both match, so a name is read one way only: with
 * both, a failed cut would retry every such apostrophe both ways.
 */
const NAME = String.raw`(?:[^${ENDS}\n]|'(?=${SEPARATOR_AHEAD})|(?<=${WORD_END})'(?=${WORD_START})(?!${SEPARATOR_AHEAD}))`
/** Where a name ends although it could go on: ". " or ", " before more words, "://", or a space before another root. */
const STOP = String.raw`[.,]\s(?=[^\\/\n]*?\s)|:\/\/|\s(?:[A-Za-z]:)?[\\/]`
/**
 * The start of a path's last part: a name character that is not a space or
 * an apostrophe and does not end a name, or an apostrophe before a letter or
 * digit ("'90s Movies").
 */
const LAST = String.raw`(?!\.\s|,\s)(?:[^\s${ENDS}]|'(?=[\p{L}\p{N}]))`
/**
 * Where a path starts (step 2): a root after one of {@link OPENS}, a root
 * right after CJK whose first name starts with an ASCII letter, digit, "_",
 * "." or "-" and ends at a separator, or a drive after anything but an ASCII
 * word character, ".", ":", "…" or a separator. A root whose next character
 * cannot start a name ("`C:\`", "`[EN]`/`[EN+--]`") is no path.
 */
const START = String.raw`(?:(?<=${OPENS})${ROOT}|(?<=[${CJK}])${ROOT}(?=[\w.-](?:(?!${STOP})${NAME})*[\\/])|(?<![\w.:…\\/])[A-Za-z]:[\\/])`

/** An absolute path's root and directories, up to its last part, where a path can start. */
const PATH_DIRECTORIES = new RegExp(String.raw`${START}(?=${LAST})(?:(?:(?!${STOP})${NAME})*[\\/](?=${NAME}|${LAST}))*(?=${LAST})`, "gu")

/** An absolute path below its root ("C:\Downloads", not "C:\" or "Downloads"). */
const BELOW_ROOT = new RegExp(String.raw`^${ROOT}[^\s\\/]`)

/**
 * `path` without the separators it ends in ("/data/tv/" is "/data/tv"), read
 * once from the end: a pattern such as /[\\/]+$/ would retry from every
 * separator of a long run of them.
 */
function withoutTrailingSeparators(path: string): string {
  let end = path.length
  while (end > 0 && (path[end - 1] === "/" || path[end - 1] === "\\")) end--
  return path.slice(0, end)
}

/**
 * `message` with every absolute path cut to its last part ("…/Show.S01").
 * `known` is a path the message may name with spaces in it, a queue item's
 * `outputPath`; it is cut first, wherever it appears.
 */
export function withoutPaths(message: string, known?: string): string {
  const path = known === undefined ? undefined : withoutTrailingSeparators(known)
  const last = path !== undefined && BELOW_ROOT.test(path) ? path.split(/[\\/]/).pop() : undefined
  const named = path !== undefined && last !== undefined ? message.replaceAll(path, () => `…/${last}`) : message
  return named.replace(PATH_DIRECTORIES, "…/")
}

/**
 * The update check's errors in English, by the anchor of their wiki link
 * (UpdateCheck.cs in Sonarr and Radarr). Their messages come in the server's
 * UI language and name the startup or UI folder and the account the app runs
 * as, often the profile name the folder holds.
 */
const UPDATE_CHECK_ERRORS = new Map([
  ["cannot-install-update-because-startup-folder-is-in-an-app-translocation-folder.", "Cannot install updates: the startup folder is in a macOS App Translocation folder."],
  ["cannot-install-update-because-startup-folder-is-not-writable-by-the-user", "Cannot install updates: the startup folder is not writable by the account the app runs as."],
  ["cannot-install-update-because-ui-folder-is-not-writable-by-the-user", "Cannot install updates: the UI folder is not writable by the account the app runs as."],
])
/** An update check error whose anchor is none of those. */
const UPDATE_CHECK_ERROR = "Cannot install updates; the wiki page for this check says why."

/** The English message for an update check error with this wiki link. */
function updateCheckError(wikiUrl: unknown): string {
  const anchor = typeof wikiUrl === "string" ? wikiUrl.slice(wikiUrl.lastIndexOf("#") + 1) : ""
  return UPDATE_CHECK_ERRORS.get(anchor) ?? UPDATE_CHECK_ERROR
}

/**
 * Health checks as Sonarr and Radarr send them, for `get_*_status` in
 * Discord, where every member may ask: each `message` without its paths
 * ("Missing root folder: …/tv"), and an update check's error ("UpdateCheck",
 * type "error") in fixed English chosen by its wiki link, since it also names
 * the account the app runs as, in any language. The other fields are kept.
 * Anything but a list of checks is none.
 */
export function healthWithoutPaths(checks: unknown): unknown[] {
  if (!Array.isArray(checks)) return []
  return checks.map((check) => {
    if (!isRecord(check)) return check
    if (check.source === "UpdateCheck" && check.type === "error") return { ...check, message: updateCheckError(check.wikiUrl) }
    return typeof check.message === "string" ? { ...check, message: withoutPaths(check.message) } : check
  })
}
