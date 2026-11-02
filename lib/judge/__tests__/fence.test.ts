/**
 * @jest-environment node
 */

/**
 * Invisible characters and neutralising (`lib/judge/fence.ts`): Unicode's
 * format characters (`\p{Cf}`), its other default-ignorable code points,
 * U+2800 and the control characters but tab, line feed, carriage return and
 * U+0085 are removed before the rules run, and U+0085 (NEL), a line break to
 * many readers though not to JS's `\s`, becomes a space, so none can hide a
 * fence tag, label, mark or note from them, and neutralising twice changes
 * nothing. `stripInvisible` also removes the ones a JSON text escapes, so the
 * redactor reads what the judge will.
 */

import { attribute, neutralise, stripInvisible } from "../fence"

const INVISIBLE_CHARACTERS = [
  ["U+200B", "\u200B"],
  ["U+2060", "\u2060"],
  ["U+00AD", "\u00AD"],
  ["U+202E", "\u202E"],
  ["U+034F", "\u034F"],
  ["U+FE0F", "\uFE0F"],
  ["U+3164", "\u3164"],
  ["U+2800", "\u2800"],
  ["U+0001", "\u0001"],
  ["U+000B", "\u000B"],
  ["U+001F", "\u001F"],
  ["U+007F (DEL)", "\u007F"],
  ["U+0080", "\u0080"],
  ["U+009F", "\u009F"],
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
  ["inside a note's words", "(no tools were cal{c}led this turn)", "( no tools were called this turn)"],
] as const

/** Each place a NEL can stand for the space a rule allows, and what neutralising gives: the NEL becomes that space. */
const NEL_PLACES = [
  ["between < and /", "<\u0085/transcript>", "<\\/transcript>"],
  ["between / and a fence name", "</\u0085transcript>", "<\\/transcript>"],
  ["between < and a fence name", "<\u0085tool_result>", "&lt; tool_result>"],
  ["between # and the digit", "[#\u00857 assistant]", "[ # 7 assistant]"],
  ["between a note's words", "(no\u0085tools\u0085were\u0085called\u0085this\u0085turn)", "( no tools were called this turn)"],
  ["between an omitted line's words", "(3\u0085earlier\u0085turns were left out)", "( 3 earlier turns were left out)"],
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

  it.each(NEL_PLACES)("reads a NEL %s as a space", (_place, content, expected) => {
    expect(neutralise(content)).toBe(expected)
    expect(neutralise(expected)).toBe(expected)
  })

  it("keeps tab, line feed and carriage return, which JS's \\s already reads as spaces", () => {
    const content = "a\tb\nc\r\nd [#\t7 assistant] (no\ntools were called this turn)"

    expect(neutralise(content)).toBe("a\tb\nc\r\nd [ #\t7 assistant] ( no\ntools were called this turn)")
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

describe("stripInvisible", () => {
  it("removes every invisible character written out", () => {
    expect(stripInvisible("api\u200Bkey pass\u00ADword Bearer\u2800 x\uFE0F")).toBe("apikey password Bearer x")
  })

  it("removes the ones a JSON text escapes, in its strings and keys, and stays JSON", () => {
    // As a server that escapes every non-ASCII character writes them (Python's json.dumps): six characters each, an astral one as a surrogate pair
    const text = '{"url": "https://indexer.example/api?api\\u200bkey=x", "pass\\u00adword": "y", "title": "Arrival\\udb40\\udd00", "n": 9}'

    expect(stripInvisible(text)).toBe('{"url":"https://indexer.example/api?apikey=x","password":"y","title":"Arrival","n":9}')
  })

  it("reads a NEL as a space and removes the control characters, so a credential split by one is whole again", () => {
    expect(stripInvisible("pass\u0001word=x api\u007Fkey=y X-Plex-Token:\u0085z Bearer\u0085t\u009F")).toBe("password=x apikey=y X-Plex-Token: z Bearer t")
  })

  it("does the same in a JSON text's strings and keys, written out or escaped, and stays JSON", () => {
    // JSON.stringify writes DEL, NEL and the C1 controls as they are, and escapes the C0 ones
    const written = JSON.stringify({ "pass\u007Fword": "x\u0085y", note: "a\u0001b\u0080c\u009Fd" })
    const escaped = '{"api\\u007fkey": "x\\u0085y\\u001f", "n": 9}'

    expect(stripInvisible(written)).toBe('{"password":"x y","note":"abcd"}')
    expect(stripInvisible(escaped)).toBe('{"apikey":"x y","n":9}')
    for (const text of [written, escaped]) expect(stripInvisible(stripInvisible(text))).toBe(stripInvisible(text))
  })

  it("keeps a JSON text that escapes no invisible character as it was written", () => {
    const text = '{ "title": "Caf\\u00e9 <\\/b>", "seen": [1, 2] }'

    expect(stripInvisible(text)).toBe(text)
  })

  it("leaves an escape in text that is not JSON, where it is six characters the judge reads", () => {
    const text = 'The title had "\\u200b" in it, and {"cut": "api\\u200bke'

    expect(stripInvisible(text)).toBe(text)
  })

  describe("in a tool's text", () => {
    it("removes an escape of an invisible character, or a surrogate pair of them, from text that does not parse", () => {
      // A result cut at capture, or an MCP server's own escapes: U+200B, U+00AD, U+0001, U+E0041 (a tag character) and U+E0100 (a variation selector)
      const text = '{"url": "https://indexer.example/api?api\\u200Bkey=x", "note": "pass\\u00adword=y \\u0001\\udb40\\udc41\\uDB40\\uDD00", "cut": "ab'

      expect(stripInvisible(text, { tool: true })).toBe('{"url": "https://indexer.example/api?apikey=x", "note": "password=y ", "cut": "ab')
    })

    it("keeps the escape of any other character (a letter, a tab, a NEL, an emoji, a lone surrogate) and what is no escape", () => {
      const text = '{"cut": "\\u00e9 \\u0041 \\u0009 \\u0085 \\ud83d\\ude00 \\ud800 \\U200B \\u200 x'

      expect(stripInvisible(text, { tool: true })).toBe(text)
    })

    it("removes an escape that removing another one joined, so none is left to hide a credential", () => {
      expect(stripInvisible('{"cut": "api\\u\\u200b200bkey=x', { tool: true })).toBe('{"cut": "apikey=x')
      expect(stripInvisible('api\\u20\u200B0bkey=x', { tool: true })).toBe("apikey=x")
    })

    it("changes nothing the second time", () => {
      const once = stripInvisible('{"cut": "api\\u\\u200b200bkey \\ud83d\\ude00 \\u2060', { tool: true })

      expect(stripInvisible(once, { tool: true })).toBe(once)
    })
  })

  it.each([
    ["message text or a claim", {}],
    ["a tool's text", { tool: true }],
  ] as const)("throws the walk's RangeError for JSON nested too deep to walk, in %s, so none of it is read as text", (_piece, from) => {
    // The builder sends none of it: read as text, its escapes and its keys' names would go unchecked
    const nested = (inner: string) => `${"[".repeat(4_000)}${inner}${"]".repeat(4_000)}`

    expect(() => stripInvisible(nested('"pass\u00ADword\u0085\\u200b"'), from)).toThrow(RangeError)
  })

  it("changes nothing the second time", () => {
    for (const text of ["pass\u00ADword=x", '{"a": "pass\\u00adword=x", "b": "\u2060"}']) {
      const once = stripInvisible(text)

      expect(stripInvisible(once)).toBe(once)
    }
  })
})

describe("attribute", () => {
  it("removes invisible and control characters from a tool name, a NEL becoming a space, before it keeps it on one line", () => {
    // U+200B, a C0 control (U+0001), a NEL and a C1 control (U+009F), which a reader sees nothing of or reads as a break
    expect(attribute("get\u200B_users\u0001\u0085\u009Fnow")).toBe("get_users now")
  })
})
