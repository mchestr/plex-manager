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
 * ## Neutralising
 *
 * {@link neutralise} runs on every piece of content before it is fenced:
 * message text, tool args and results, prior claims, the assistant's system
 * prompt and its catalog. It removes every format character first, then
 * applies the other rules:
 *
 * | in content                                      | becomes                                 |
 * |-------------------------------------------------|-----------------------------------------|
 * | a format character (`\p{Cf}`), such as U+200B   | removed                                 |
 * | a closing fence tag, `</transcript`             | `<\/transcript`                         |
 * | an opening fence tag, `<tool_result`            | `&lt;tool_result`                       |
 * | a label, `[#7 assistant]` or `[# 7 assistant]`  | `[ #7 assistant]` or `[ # 7 assistant]` |
 * | the mark, `[truncated]`                         | `[ truncated]`                          |
 * | a note, `(no tools were called this turn)`      | `( no tools were called this turn)`     |
 * | the line, `(3 earlier turns were left out)`     | `( 3 earlier turns were left out)`      |
 *
 * Format characters (U+200B, U+2060, U+00AD, U+FEFF, the bidi controls and
 * the rest of Unicode's Cf) are invisible, so one inside a tag, label, mark
 * or note (`</`, U+200B, `transcript`) would read as the real thing yet slip
 * past the rules. Fence names, marks and notes match in any letter case, a
 * tag with spaces after its `<` or `/` too, a label with spaces before its
 * digit, and a note by its opening words.
 *
 * ## Special cases
 *
 * - The only backslash added is in `<\/`, JSON's own escape for `</`, so a
 *   tool result stays JSON (its strings change, never its shape) and `verify`
 *   can still match a quote leaf by leaf. Valid JSON holds a format character
 *   only inside a string, so removing one changes a string, never the shape.
 * - Neutralising twice changes nothing: no format character is left, and no
 *   rule matches its own output (a space after `[` or `(` stops the label,
 *   mark and note rules). `fitWithin` neutralises a cut piece again, and
 *   every rule but the closing tag's looks only for a fixed start, so a cut
 *   cannot make a new match. Only the closing tag's word boundary can
 *   (`</transcripts` cut to `</transcript`): one character more, which the
 *   budget reserves. Removing format characters only shortens text, and a
 *   cut piece has none left to remove, so that reserve still holds.
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
/** Unicode's format characters: invisible, so they could hide a tag, label, mark or note from the rules below. */
const FORMAT = /\p{Cf}/gu
/** A label's `[#7` (or `[# 7`), or the mark's `[truncated`. */
const BRACKET = /\[(?=#\s*\d|truncated)/gi
/** A note's opening words, or an omitted line's "(3 earlier ". */
const NOTE = /\((?=tool\s+results\s+not\s+recorded|no\s+tools\s+were\s+called|already\s+reviewed|message\s+unreadable|\d+\s+earlier\s)/gi

/** The text with every tag, label, mark and note in it neutralised; see the module comment. */
export function neutralise(text: string): string {
  return text.replace(FORMAT, "").replace(CLOSE_TAG, "<\\/").replace(OPEN_TAG, "&lt;").replace(BRACKET, "[ ").replace(NOTE, "( ")
}

/** An attribute value on one line, as numeric entities, so a tool name cannot end the attribute or the tag, or start a line. */
export const attribute = (text: string) => text.replace(/\s+/g, " ").replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`)
