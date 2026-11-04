/**
 * Credentials replaced inside free text: the string rules of the MCP result
 * guard (`lib/mcp/redact.ts`) and of the Support role's scrubber
 * (`lib/chatbot/executors/role-scrub.ts`), in one place so the two cannot
 * drift. Each of those keeps its own rule for JSON keys; this module reads
 * strings, free text included (a stored LLM prompt holds earlier tool results).
 *
 * ## Rules
 *
 * {@link redactText} applies four rules in turn, each in one pass, and puts
 * {@link REDACTED} where each credential was:
 *
 * 1. **Credential pairs.** A name that holds a secret word (`token`, `apikey`
 *    or `api_key`, `secret`, `password`, `passwd`, `passkey`, `authorization`)
 *    and its value:
 *    - `name=value`, whatever the value (as in a query string), `name="value"`
 *      and `name='value'`;
 *    - `name%3Dvalue` and `name%253Dvalue` (percent-encoded once or twice, the
 *      hex digits in either case), whose value also ends at `%26` or `%2526`;
 *    - `name: value` and `name = value` (header or config style), when the
 *      name ends in the secret word (`X-Plex-Token`, not `tokenCount`) and the
 *      value is quoted or a loose credential (below), and the same after "API
 *      key" written as two words;
 *    - `"name": "value"`, the same escaped inside a string
 *      (`\"name\":\"value\"`, at any depth) and `'name': 'value'`, for a quoted
 *      string value only, so `"tokenCount": 42` keeps its number.
 *
 *    A name ending in `tokens` is a count (`max_tokens=4096`,
 *    `"promptTokens":"120"`). An `Authorization` header name is rule 2's.
 * 2. **Authorization headers.** `Authorization` in any letter case, alone or
 *    after a prefix ending in `-` (`Proxy-Authorization`,
 *    `X-Emby-Authorization`), followed by `:`, `=` or a space, or as a JSON or
 *    dict key. The header name and the scheme word stay, and the credentials
 *    go:
 *    - a quoted value, all but a leading word of letters (its scheme);
 *    - an auth-param list (`MediaBrowser Client="...", Token="..."`, RFC 9110
 *      11.4) whose first value is quoted or that has two params or more,
 *      after any scheme that follows `:` or `=`, and after a space only after
 *      a scheme known by name (Bearer, Basic, Token, Bot, ApiKey, Negotiate,
 *      NTLM, DPoP, Digest, MediaBrowser, Emby, HOBA, Mutual, VAPID, OAuth,
 *      HMAC) or when the first value is quoted, so "Authorization failed
 *      reason=expired, code=401" stays;
 *    - any run of 8 or more characters after `Bearer` or `Basic` as HTTP
 *      writes them, and a credential-shaped run (below) after a scheme of one
 *      token (those two in another case, `Token`, `Bot`, `ApiKey`,
 *      `Negotiate`, `NTLM`, `DPoP`);
 *    - after any other word, a run shaped like a token: 16 hex digits in a
 *      row, or 16 characters or more with lower case, capitals and a digit;
 *    - with no scheme, the whole value after `=`, and a loose credential after
 *      `:`. After `=`, only a word of letters and a space is a scheme, so
 *      "authorization=Zq9PlexTok3nXyz12 path=/library" loses the token.
 * 3. **A bare Bearer or Basic.** Written as HTTP writes them, the run after it
 *    when it starts with 8 token characters (as it always had to) or holds an
 *    `=` or is shaped like a token, and is not a title: a word of letters
 *    alone or before punctuation, or of three letters or more before a
 *    character no token holds ("Instinct(1992)", "Training:Week-1"). In
 *    another case (`basic`, `BEARER`), where the word is as often English,
 *    only a run with base64 padding at its end, 16 hex digits, a JWT, or one
 *    shaped like a token with no "/" in it, so "basic quality=1080p" and
 *    "basic 4K/HDR10/DolbyVision" stay.
 * 4. **A password in a URL.** `scheme://user:password@host` loses the
 *    password.
 *
 * A value ends where a query string's value would, at `&`, whitespace, a
 * quote or an angle bracket, never at `@ : % ! ,`: "Basic password=p@ssw0rd!"
 * loses the whole run. A double-quoted value ends at its closing quote, or at
 * the end of a text that was cut short; a single-quoted one at its closing
 * quote on its line, or at the end of a cut text when it holds no space, so an
 * apostrophe opens none ("Secret: 'Tis the season").
 *
 * ## Credential-shaped
 *
 * Where neither the name nor the scheme settles it, a run is a credential when
 * it has 8 or more characters and is not a single word of letters: a title
 * such as "Instinct", "Instinct.", "Instinct, then Heat" or "Instinct’s"
 * stays, and a run with digits, symbols or a `name=` in it goes. After a
 * header or config style separator, where prose and error codes go too, a
 * loose credential has 6 or more characters and is neither a single word of
 * letters nor a code in capitals and `_`: "password: hunter2" goes, and
 * "Password: required" and "stored secret: KEY_UNKNOWN" stay. Pairs run
 * first, so a pair's value is gone before a scheme's run could reach it.
 *
 * ## Known misses and over-reach
 *
 * These rules back up the key rules and the loaders' own masking; they read
 * shapes, so some credentials pass: a single word of letters after a header
 * or config style separator ("password: hunter"), and a run under 8
 * characters after a bare `Basic` or `Bearer`. The other way, `name=value`
 * loses its value whenever the name holds a secret word, so `tokenCount=5`,
 * `secretary=Jane` and `passwordless=true` are redacted too. That is the
 * safe direction for a backstop, and a test row (`tokenCount=42`) pins it:
 * narrowing it would let a credential through.
 *
 * ## Time
 *
 * Every string of every result passes through here, member-chosen text
 * included (a player's name), so each rule runs in time linear in its input. A
 * run of name characters, and a URL's scheme, is read once by a lookahead,
 * which is never backtracked into, so it is never re-split; a quoted value is
 * read once to its closing quote; the title test reads a run once, and every
 * other test looks at most 64 characters ahead or to the end of its own run.
 *
 * @module
 *
 * @example
 * ```ts
 * redactText('curl -H "X-Plex-Token: Zq9PlexTok3nXyz12" http://plex:32400/library/sections')
 * // 'curl -H "X-Plex-Token: [redacted]" http://plex:32400/library/sections'
 * redactText("Authorization: MediaBrowser Client=\"Plex Manager\", Token=\"0123abcd\"")
 * // 'Authorization: MediaBrowser [redacted]'
 * redactText("We watched Basic Instinct.") // unchanged
 * ```
 */

/** What replaces a credential. */
export const REDACTED = "[redacted]"

/** `word` in any letter case: the rules take no `i` flag, because the title test is case-sensitive. */
const anyCase = (word: string) => word.replace(/[a-z]/g, (letter) => `[${letter}${letter.toUpperCase()}]`)
const anyOf = (words: string[]) => `(?:${words.map(anyCase).join("|")})`

const SECRET_WORD = anyOf(["token", "api[_-]?key", "secret", "password", "passwd", "passkey", "authorization"])
const AUTHORIZATION = anyCase("authorization")
/** Bearer and Basic as HTTP writes them; in another case they are as often English ("basic training"). */
const BEARER_OR_BASIC_WRITTEN = "(?:Bearer|Basic)"
const BEARER_OR_BASIC = anyOf(["bearer", "basic"])
/** Schemes whose credentials are one token, Bearer and Basic among them. */
const TOKEN_SCHEMES = ["bearer", "basic", "token", "bot", "apikey", "negotiate", "ntlm", "dpop"]
const TOKEN_SCHEME = anyOf(TOKEN_SCHEMES)
/** Every scheme known by name: those and the ones that take auth-params (Digest, MediaBrowser and Emby). */
const KNOWN_SCHEME = anyOf([...TOKEN_SCHEMES, "digest", "mediabrowser", "emby", "hoba", "mutual", "vapid", "oauth", "hmac"])
const SCHEME = String.raw`[A-Za-z][\w.+-]*`

/**
 * Numbers the named groups. A name only ties a rule's pattern to the
 * replacement {@link rule} builds from that same pattern, so building the
 * rules in another order renames the groups and changes nothing outside this
 * module.
 */
let groupCount = 0
/** A fresh name for a group that is only matched against: a name's run, an escape's backslashes. */
const ref = () => `r${++groupCount}`
/** Text kept before a credential, and a closing quote kept after it (see {@link rule}). */
const keep = (pattern: string) => `(?<k${++groupCount}>${pattern})`
const close = (pattern: string) => `(?<c${++groupCount}>${pattern})`

/** A name's whole run of name characters, read once by a lookahead (never re-split on backtracking). */
const nameRun = (name: string) => String.raw`(?=(?<${name}>[\w-]+))\k<${name}>`
/** After a name: it ends in Authorization, alone or after a prefix ending in "-". */
const IS_HEADER = String.raw`(?<=(?<!\w)${AUTHORIZATION})`
/** After a name: it holds a secret word, is not a count ("max_tokens") and is not a header. */
const IS_SECRET = String.raw`(?<=${SECRET_WORD}[\w-]*)(?<!${anyCase("tokens")})(?<!(?<!\w)${AUTHORIZATION})`
/** After a name: it ends in the secret word. */
const ENDS_IN_SECRET = String.raw`(?<=${SECRET_WORD})`
/** A header or config style separator: ":", or "=" with a space beside it. */
const LOOSE = String.raw`(?:\s*:\s*|\s+=\s*|=\s+)`
const ANY_SEPARATOR = String.raw`(?:\s*[:=]\s*|\s+)`
/** Before a scheme kept as such: after "=" only a word of letters, so a token after "=" is never kept as a scheme. */
const SCHEME_SEPARATOR = String.raw`(?:\s*:\s*|\s+|\s*=\s*(?=[A-Za-z]+\s))`

/** A value's characters, as in a query string. */
const VALUE_CHAR = String.raw`[^&\s"'<>]`
const VALUE = `${VALUE_CHAR}+`
const ENCODED_VALUE = String.raw`(?:(?!%(?:25)?26)${VALUE_CHAR})+`
/** A run that starts like a token: a letter, a digit or one of . _ ~ + / = -. */
const RUN = String.raw`[\w.~+/=-]${VALUE_CHAR}*`
const LONG_RUN = String.raw`(?=[\w.~+/=-]${VALUE_CHAR}{7})${RUN}`
/**
 * A whole run that is one word of letters, capitalised or lower case (with a
 * possessive, "Instinct’s"), then at most punctuation or a list: a title, not
 * a credential.
 */
const WORD = String.raw`\p{Lu}?\p{Ll}+(?:’\p{Ll}+)?(?:[,;]|(?:(?![&"'<>])[\p{P}\p{S}])*(?!${VALUE_CHAR}))`
const CREDENTIAL = `(?!${WORD})${LONG_RUN}`
/**
 * A credential after a header or config style separator, where prose and
 * error codes go too ("Password: required", "stored secret: KEY_UNKNOWN"): a
 * run of 6 or more that is not a single word of letters or a code in capitals
 * and "_" ("password: hunter2", "password: correct-horse-battery").
 */
const LOOSE_CREDENTIAL = String.raw`(?!${WORD})(?![\p{Lu}_]+(?!${VALUE_CHAR}))(?=[\w.~+/=-]${VALUE_CHAR}{5})${RUN}`
/**
 * Shaped like a token rather than a date, version, format, error code or
 * product name ("2026-11-30", "1.21.0", "H.264/AAC", "0x80070005",
 * "PlayStation-5"): 16 hex digits in a row, or 16 characters or more with
 * lower case, capitals and a digit. A run that holds an "=" is token-shaped
 * too.
 */
const STRONG_TOKEN = String.raw`(?:(?=${VALUE_CHAR}*?[\dA-Fa-f]{16})|(?=${VALUE_CHAR}{16})(?=${VALUE_CHAR}*?\p{Ll})(?=${VALUE_CHAR}*?\p{Lu})(?=${VALUE_CHAR}*?\d))`
const TOKEN_SHAPE = String.raw`(?:(?=${VALUE_CHAR}*=)|${STRONG_TOKEN})`
/**
 * Token-shaped where "bearer" or "basic" is as often English: base64 padding
 * at the end, 16 hex digits, a JWT, or a run {@link STRONG_TOKEN} counts that
 * holds no "/" ("basic quality=1080p" and "basic 4K/HDR10/DolbyVision" stay).
 */
const CASELESS_TOKEN = String.raw`(?:(?=${VALUE_CHAR}*?[\w+/]={1,2}(?!${VALUE_CHAR}))|(?=${VALUE_CHAR}*?[\dA-Fa-f]{16})|(?=eyJ)|(?!${VALUE_CHAR}*\/)${STRONG_TOKEN})`
/** A title after Bearer or Basic as HTTP writes them, as one has always read: a word of three letters or more, then no token character ("Instinct(1992)"). */
const WRITTEN_TITLE = String.raw`\p{Lu}?\p{Ll}{2,}\.?(?![\w.~+/=-])`

/** A JSON string's characters, escapes included, and its closing quote or the end of a cut text. */
const JSON_CHAR = String.raw`(?:[^"\\]|\\[^])`
const JSON_CLOSE = String.raw`(?:"|\\?$)`
/** A single-quoted value ends at its closing quote on its line, or at the end of a cut text if it holds no space: else the quote is an apostrophe ("Secret: 'Tis the season"). */
const DICT_CHAR = String.raw`(?:[^'\\\n]|\\[^])`
const dictValue = (closeQuote: string) => String.raw`(?:${DICT_CHAR}+${closeQuote}|[^'\\\s]+\\?$)`
/**
 * The characters of a string escaped once or more (`\"...\"`, JSON written
 * into a JSON string): its quote is the run of backslashes captured as
 * `quote` and a `"`, so a quote with any other number is the inner text's.
 */
const escapedChar = (quote: string) => String.raw`(?:[^"\\]|\\+(?![\\"])|(?!\k<${quote}>")\\*")`
const escapedClose = (quote: string) => String.raw`(?:\k<${quote}>"|$)`

/** A quoted value, JSON, escaped or dict style: its characters are the credential, less a leading scheme word when kept. */
function quotedValue(keepScheme: boolean): string {
  const scheme = keepScheme ? String.raw`(?:[A-Za-z]+\s+)?` : ""
  const quote = ref()
  return [
    `${keep(`"${scheme}`)}${JSON_CHAR}+${close(JSON_CLOSE)}`,
    `${keep(String.raw`(?<!\\)(?<${quote}>\\+)"${scheme}`)}${escapedChar(quote)}+${close(escapedClose(quote))}`,
    `${keep(`'${scheme}`)}${dictValue(close("'"))}`,
  ].join("|")
}

/** A quoted name and value, `"name": "value"`, `\"name\": \"value\"` or `'name': 'value'`, the name passing `check`. */
function quotedPair(check: string, keepScheme: boolean): string {
  const scheme = keepScheme ? String.raw`(?:[A-Za-z]+\s+)?` : ""
  const quote = ref()
  const escaped = String.raw`\k<${quote}>"`
  return [
    `${keep(String.raw`"${nameRun(ref())}${check}"\s*:\s*"${scheme}`)}${JSON_CHAR}+${close(JSON_CLOSE)}`,
    `${keep(String.raw`(?<!\\)(?<${quote}>\\+)"${nameRun(ref())}${check}${escaped}\s*:\s*${escaped}${scheme}`)}${escapedChar(quote)}+${close(escapedClose(quote))}`,
    `${keep(String.raw`'${nameRun(ref())}${check}'\s*:\s*'${scheme}`)}${dictValue(close("'"))}`,
  ].join("|")
}

/** One auth-param, `name=token` or `name="quoted"` (RFC 9110 11.4). */
function authParam(): string {
  const quote = ref()
  const quoted = [
    String.raw`"${JSON_CHAR}*${JSON_CLOSE}`,
    String.raw`(?<!\\)(?<${quote}>\\+)"${escapedChar(quote)}*${escapedClose(quote)}`,
    String.raw`'${DICT_CHAR}*(?:'|\\?$)`,
  ].join("|")
  return String.raw`[\w-]+\s*=\s*(?:${quoted}|[^\s,"'<>&]*)`
}

/** A credential pair whose name is not a header (rule 1). */
function secretPair(): string {
  const loose = `${ENDS_IN_SECRET}${LOOSE}`
  const forms = [
    `${keep("=")}(?:${quotedValue(false)})`,
    `${keep(String.raw`=${BEARER_OR_BASIC}\s+`)}${CREDENTIAL}`,
    `${keep("=")}${VALUE}`,
    `${keep("%(?:25)?3[Dd]")}${ENCODED_VALUE}`,
    `${keep(loose)}(?:${quotedValue(false)})`,
    `${keep(loose)}${LOOSE_CREDENTIAL}`,
  ]
  // An API key named in words, as an admin writes one in a chat message ("My Sonarr API key: ...")
  const apiKey = `${keep(String.raw`(?<![\w-])${anyCase("api")}\s+${anyCase("key")}${LOOSE}`)}(?:${quotedValue(false)}|${LOOSE_CREDENTIAL})`
  return String.raw`${quotedPair(IS_SECRET, false)}|(?<![\w-])${keep(nameRun(ref()))}${IS_SECRET}(?:${forms.join("|")})|${apiKey}`
}

/** An Authorization header's credentials (rule 2). */
function authHeader(): string {
  // A list that reads as auth-params, not "failed reason=expired": its first value quoted, or two params or more
  const list = String.raw`(?=[\w-]+\s*=\s*(?:["']|\\+"|[^\s,"'<>&]*\s*,\s*[\w-]+\s*=))`
  // Built for each use, since an auth-param names its own groups
  const params = () => String.raw`${list}${authParam()}(?:\s*,\s*${authParam()})*${VALUE_CHAR}*`
  const quotedFirst = String.raw`(?=[\w-]+\s*=\s*(?:["']|\\+"))`
  const forms = [
    `${keep(String.raw`\s*[:=]\s*`)}(?:${quotedValue(true)})`,
    // Any word after ":" or "=" is a scheme; after a space only a known one, or one whose first param is quoted ("failed reason=expired" is prose)
    `${keep(String.raw`(?:\s*:\s*|\s*=\s*(?=[A-Za-z]+\s))${SCHEME}\s+`)}${params()}`,
    `${keep(String.raw`\s+${KNOWN_SCHEME}\s+`)}${params()}`,
    `${keep(String.raw`\s+${SCHEME}\s+`)}${quotedFirst}${params()}`,
    `${keep(String.raw`${ANY_SEPARATOR}${BEARER_OR_BASIC_WRITTEN}\s+`)}${LONG_RUN}`,
    `${keep(String.raw`${ANY_SEPARATOR}${TOKEN_SCHEME}\s+`)}${CREDENTIAL}`,
    `${keep(String.raw`${SCHEME_SEPARATOR}${SCHEME}\s+`)}${STRONG_TOKEN}${CREDENTIAL}`,
    `${keep(String.raw`=(?=[A-Za-z]+\s)${SCHEME}\s+`)}${CREDENTIAL}`,
    `${keep("=")}${VALUE}`,
    `${keep("%(?:25)?3[Dd]")}${ENCODED_VALUE}`,
    `${keep(LOOSE)}${LOOSE_CREDENTIAL}`,
  ]
  return String.raw`${quotedPair(IS_HEADER, true)}|(?<![\w-])${keep(nameRun(ref()))}${IS_HEADER}(?:${forms.join("|")})`
}

/**
 * A bare Bearer or Basic (rule 3). As HTTP writes them, a run of 8 token
 * characters counts, as it always has; in any other case only a token-shaped
 * run does, so "basic 1080p/2160p" stays.
 */
function bareScheme(): string {
  const written = String.raw`${keep(String.raw`${BEARER_OR_BASIC_WRITTEN}\s+`)}(?!${WRITTEN_TITLE})(?:(?=[\w.~+/=-]{8})|${TOKEN_SHAPE})`
  return String.raw`\b(?:${written}|${keep(String.raw`${BEARER_OR_BASIC}\s+`)}${CASELESS_TOKEN})${CREDENTIAL}`
}

/** A password in a URL's userinfo, `scheme://user:password@host` (rule 4). The scheme is read once, as a name is. */
function urlPassword(): string {
  const scheme = ref()
  return String.raw`${keep(String.raw`(?<![\w+.-])(?=(?<${scheme}>[A-Za-z][\w+.-]*))\k<${scheme}>://[^\s/:@"'<>]*:`)}[^\s/@"'<>]+(?=@)`
}

/**
 * A rule's pattern and its replacement: every kept group in the pattern's
 * order, then {@link REDACTED}, then the kept closing quote. A match sets the
 * groups of one alternative only, and an unset group adds nothing. A
 * replacement string rather than a function, because V8 then builds no groups
 * object per match, which on a text of many pairs costs ten times the matching.
 */
function rule(source: string): [RegExp, string] {
  const groups = (kind: string) => [...source.matchAll(new RegExp(String.raw`\(\?<(${kind}\d+)>`, "g"))].map(([, name]) => `$<${name}>`).join("")
  return [new RegExp(source, "gu"), `${groups("k")}${REDACTED}${groups("c")}`]
}

const RULES = [secretPair(), authHeader(), bareScheme(), urlPassword()].map(rule)

/** `text` with every credential the rules find replaced by {@link REDACTED}. */
export function redactText(text: string): string {
  return RULES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text)
}
