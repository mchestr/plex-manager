/**
 * The judge prompt's structure, and the neutralising that keeps content from
 * passing for it.
 *
 * ## Structure
 *
 * Only `buildJudgePrompt` writes these: the fence tags (`<transcript>`,
 * `<tool_result ...>`, `<already_raised>`, `<assistant_system_prompt>`,
 * `<tool_catalog>` and their closing tags), each message's `[#7 assistant]`
 * label, the notes beside it ({@link NOTES}), the {@link TRUNCATED} mark after
 * a cut piece, and the "(3 earlier turns were left out)" and "(2 earlier
 * findings left out)" lines.
 *
 * ## Invisible characters
 *
 * A reader sees nothing of these, or a blank where there is no space, so one
 * inside a tag, label, mark or note (`</`, U+200B, `transcript`) would read as
 * the real thing yet slip past the rules below, and one inside a credential
 * (`pass`, U+00AD, `word=`) would hide it from the redactor:
 *
 * - Unicode's format characters (`\p{Cf}`): U+200B, U+2060, U+00AD, U+FEFF,
 *   the bidi controls, the tag characters and the rest;
 * - the rest of its default-ignorable code points
 *   (`\p{Default_Ignorable_Code_Point}`), which render as nothing too: U+034F,
 *   the variation selectors (U+FE0F), the Hangul fillers (U+3164, U+FFA0),
 *   U+180B, U+17B4 and the unassigned ones;
 * - U+2800, the braille blank, which is neither but reads as a space, so
 *   `<`, U+2800, `/transcript>` reads as a closing tag;
 * - the control characters but tab, line feed, carriage return and U+0085:
 *   the other C0 ones, DEL and the C1 ones, which `JSON.stringify` writes as
 *   they are (all but the C0 ones) and a reader shows as nothing.
 *
 * U+0085 (NEL) is a line break to Unicode and to many readers, a tokenizer's
 * pre-split included, but not to JS's `\s`, so `<`, NEL, `/transcript>` and
 * `[#`, NEL, `9 user]` would read as a closing tag and a label yet slip past
 * the rules below. It becomes a space before them, which a JSON string can
 * hold as it is.
 *
 * {@link stripInvisible} removes them, and in a JSON text also the ones its
 * strings and keys escape (`\u200b`, as a server that escapes every non-ASCII
 * character writes them), which parsing turns into the characters themselves.
 * The prompt builder runs it on every piece it redacts, before
 * `redactCredentials`, so the redactor reads what the judge will get
 * (`lib/judge/build-prompt.ts`). JSON whose strings escape none keeps its
 * text as written. Text that does not parse, such as a cut tool result,
 * keeps an escape as the six characters the judge reads.
 *
 * ## Neutralising
 *
 * {@link neutralise} runs on every piece of content before it is fenced:
 * message text, tool args and results, prior claims, the assistant's system
 * prompt and its catalog. It first removes every invisible character and
 * turns a NEL into a space (a JSON escape of either is six characters the
 * judge reads, so it stays), then applies the other rules:
 *
 * | in content                                       | becomes                                 |
 * |--------------------------------------------------|-----------------------------------------|
 * | an invisible character, such as U+200B or U+2800 | removed                                 |
 * | a NEL, U+0085                                    | a space                                 |
 * | a closing fence tag, `</transcript`              | `<\/transcript`                         |
 * | an opening fence tag, `<tool_result`             | `&lt;tool_result`                       |
 * | a label, `[#7 assistant]` or `[# 7 assistant]`   | `[ #7 assistant]` or `[ # 7 assistant]` |
 * | the mark, `[truncated]`                          | `[ truncated]`                          |
 * | a note, `(no tools were called this turn)`       | `( no tools were called this turn)`     |
 * | the line, `(3 earlier turns were left out)`      | `( 3 earlier turns were left out)`      |
 *
 * Fence names, marks and notes match in any letter case, a tag with spaces
 * after its `<` or `/` too, a label with spaces before its digit, and a note
 * by its opening words.
 *
 * ## Special cases
 *
 * - The only backslash added is in `<\/`, JSON's own escape for `</`, so a
 *   tool result stays JSON (its strings change, never its shape) and `verify`
 *   can still match a quote leaf by leaf. Valid JSON holds an invisible
 *   character or a NEL only inside a string (a C0 control not even there),
 *   so removing one, or writing a space for a NEL, changes a string, never
 *   the shape.
 * - Neutralising twice changes nothing: no invisible character or NEL is
 *   left, and no rule matches its own output (a space after `[` or `(` stops
 *   the label, mark and note rules). `fitWithin` neutralises a cut piece
 *   again, and every rule but the closing tag's looks only for a fixed start,
 *   so a cut cannot make a new match. Only the closing tag's word boundary
 *   can (`</transcripts` cut to `</transcript`): one character more, which
 *   the budget reserves. Removing characters only shortens text, a space for
 *   a NEL keeps its length, and a cut piece has neither left, so that reserve
 *   still holds.
 *
 * @module lib/judge/fence
 */

export const TRUNCATED = "[truncated]"

/** The notes the builder writes beside a message, or in place of text that no longer decrypts. */
export const NOTES = {
  noLog: "(tool results not recorded)",
  noTools: "(no tools were called this turn)",
  reviewed: "(already reviewed, for context)",
  unreadable: "(message unreadable)",
} as const

export const omittedTurns = (count: number) => `(${count} earlier ${count === 1 ? "turn was" : "turns were"} left out)`
export const omittedFindings = (count: number) => `(${count} earlier ${count === 1 ? "finding" : "findings"} left out)`

const FENCES = "transcript|tool_result|already_raised|assistant_system_prompt|tool_catalog"
const CLOSE_TAG = new RegExp(`<\\s*/\\s*(?=(?:${FENCES})\\b)`, "gi")
const OPEN_TAG = new RegExp(`<(?=\\s*(?:${FENCES}))`, "gi")
/** Characters that show nothing, or a space where there is none, and the controls but tab, line feed, carriage return and NEL; see the module comment. */
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]|(?![\t\n\r\u0085])\p{Cc}/gu
/** U+0085, a line break to many readers though not to JS's `\s`. */
const NEL = /\u0085/g
/** A label's `[#7` (or `[# 7`), or the mark's `[truncated`. */
const BRACKET = /\[(?=#\s*\d|truncated)/gi
/** A note's opening words, or an omitted line's "(3 earlier ". */
const NOTE = /\((?=tool\s+results\s+not\s+recorded|no\s+tools\s+were\s+called|already\s+reviewed|message\s+unreadable|\d+\s+earlier\s)/gi

/** The text with every NEL a space and every invisible character removed. */
const clean = (text: string) => text.replace(NEL, " ").replace(INVISIBLE, "")

/** A parsed JSON value with every NEL a space and every invisible character removed, in its strings and keys. */
function stripValue(value: unknown): unknown {
  if (typeof value === "string") return clean(value)
  if (Array.isArray(value)) return value.map(stripValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [clean(key), stripValue(item)]))
}

/** The text with every NEL a space and every invisible character removed, a JSON text's escaped ones too; see the module comment. */
export function stripInvisible(text: string): string {
  const stripped = clean(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return stripped
  }
  const next = JSON.stringify(stripValue(parsed))
  // JSON whose strings escape none keeps the text as written
  return next === JSON.stringify(parsed) ? stripped : next
}

/** The text with every tag, label, mark and note in it neutralised; see the module comment. */
export function neutralise(text: string): string {
  return clean(text).replace(CLOSE_TAG, "<\\/").replace(OPEN_TAG, "&lt;").replace(BRACKET, "[ ").replace(NOTE, "( ")
}

/** An attribute value on one line (a NEL too), as numeric entities, so a tool name cannot end the attribute or the tag, or start a line. */
export const attribute = (text: string) => text.replace(/[\s\u0085]+/g, " ").replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`)
