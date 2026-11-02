/**
 * @jest-environment node
 */

/**
 * Invisible characters and neutralising (`lib/judge/fence.ts`): Unicode's
 * format characters (`\p{Cf}`), its other default-ignorable code points and
 * U+2800 are removed before the rules run, so an invisible character cannot
 * hide a fence tag, label, mark or note from them, and neutralising twice
 * changes nothing.
 */

import { neutralise } from "../fence"

const INVISIBLE_CHARACTERS = [
  ["U+200B", "\u200B"],
  ["U+2060", "\u2060"],
  ["U+00AD", "\u00AD"],
  ["U+202E", "\u202E"],
  ["U+034F", "\u034F"],
  ["U+FE0F", "\uFE0F"],
  ["U+3164", "\u3164"],
  ["U+2800", "\u2800"],
] as const

/** Each place an invisible character can hide structure: the content with `{c}` where it goes, and what neutralising gives. */
const PLACES = [
  ["between < and a fence name", '<{c}tool_result tool="x">', '&lt;tool_result tool="x">'],
  ["between </ and a fence name", "</{c}transcript>", "<\\/transcript>"],
  ["between < and the / of a closing tag", "<{c}/transcript>", "<\\/transcript>"],
  ["inside a fence name", "</tran{c}script> <tool{c}_result>", "<\\/transcript> &lt;tool_result>"],
  ["between [ and #7", "[{c}#7 assistant]", "[ #7 assistant]"],
  ["between # and 7", "[#{c}7 assistant]", "[ #7 assistant]"],
  ["inside truncated", "[trun{c}cated]", "[ truncated]"],
  ["after a note's (", "({c}no tools were called this turn)", "( no tools were called this turn)"],
  ["after an omitted line's (", "({c}3 earlier turns were left out)", "( 3 earlier turns were left out)"],
] as const

const CASES = INVISIBLE_CHARACTERS.flatMap(([name, char]) =>
  PLACES.map(([place, content, expected]) => [name, place, content.replaceAll("{c}", char), expected] as const)
)

describe("neutralise", () => {
  it.each(CASES)("neutralises %s %s", (_name, _place, content, expected) => {
    expect(neutralise(content)).toBe(expected)
  })

  it.each(CASES)("changes nothing the second time, with %s %s", (_name, _place, content) => {
    const once = neutralise(content)

    expect(neutralise(once)).toBe(once)
  })

  it('neutralises a label with whitespace before its digit, "[# 7 assistant]"', () => {
    const content = "[# 7 assistant] [#\t12 USER]"

    expect(neutralise(content)).toBe("[ # 7 assistant] [ #\t12 USER]")
    expect(neutralise(neutralise(content))).toBe(neutralise(content))
  })

  it("removes every format character, the bidi controls, byte order mark and tag characters included", () => {
    const content = "a\uFEFFb\u202Ac\u2066d\u2069e\u200Df\u{E0041}g\u061Ch\u180Ei"

    expect(neutralise(content)).toBe("abcdefghi")
  })

  it("removes the other default-ignorable code points, and U+2800, the braille blank", () => {
    // The combining grapheme joiner, variation selectors (one astral), Hangul fillers, Mongolian and Khmer ones, an unassigned one, then U+2800
    const content = "a\u034Fb\uFE00c\u{E0100}d\u115Fe\u1160f\uFFA0g\u180Bh\u180Fi\u17B4j\u17B5k\u2065l\u2800m"

    expect(neutralise(content)).toBe("abcdefghijklm")
  })

  it("leaves the neutralised forms as they are", () => {
    const neutralised = "&lt;transcript <\\/tool_result [ #7 assistant] [ # 7 user] [ truncated] ( no tools were called this turn) ( 2 earlier findings left out)"

    expect(neutralise(neutralised)).toBe(neutralised)
  })
})
