/**
 * @jest-environment node
 */
import { REDACTED, redactText } from "@/lib/security/redact-text"

/** Discord's documented example bot token, built from its parts so secret scanning does not take it for a leak. */
const DISCORD_BOT_TOKEN = ["MTk4NjIyNDgzNDcxOTI1MjQ4", "Cl2FMQ", "ZnCjm1XVW7vRze4b7Cq4se7kKWs"].join(".")

const JELLYFIN_PARAMS =
  'Client="Plex Manager", Device="Server", DeviceId="plex-manager-0123456789abcdef", Version="1.2.3", Token="0123456789abcdef0123456789abcdef"'

describe("redactText: credential pairs", () => {
  it.each([
    // In a URL or query string, whatever the value
    [
      "http://prowlarr:9696/1/download?apikey=raw-indexer&link=abc&passkey=raw-pass",
      "http://prowlarr:9696/1/download?apikey=[redacted]&link=abc&passkey=[redacted]",
    ],
    ["http://plex:32400/x?X-Plex-Token=raw-plex&size=2", "http://plex:32400/x?X-Plex-Token=[redacted]&size=2"],
    ["?api_key=raw-key", "?api_key=[redacted]"],
    ["tokenCount=42", "tokenCount=[redacted]"],
    // Quoted after "="
    ['apikey="0123456789abcdef0123456789abcdef"', 'apikey="[redacted]"'],
    ["token='abc123'", "token='[redacted]'"],
    [String.raw`apikey=\"0123456789abcdef\"`, String.raw`apikey=\"[redacted]\"`],
    // Header or config style, the name ending in its secret word
    ['curl -H "X-Plex-Token: Zq9PlexTok3nXyz12" http://plex:32400/library/sections', 'curl -H "X-Plex-Token: [redacted]" http://plex:32400/library/sections'],
    ['curl -H "X-Api-Key: 0123456789abcdef0123456789abcdef" http://sonarr:8989/api/v3/series', 'curl -H "X-Api-Key: [redacted]" http://sonarr:8989/api/v3/series'],
    ["password = hunter2hunter2", "password = [redacted]"],
    ["password =hunter2hunter2", "password =[redacted]"],
    ["password= hunter2hunter2", "password= [redacted]"],
    ["password: correct-horse-battery", "password: [redacted]"],
    ["password: hunter2", "password: [redacted]"],
    // An API key named in words, as an admin writes one in a chat message
    ["My Sonarr API key: 0123456789abcdef0123456789abcdef", "My Sonarr API key: [redacted]"],
    ["Tautulli API Key = 0123456789abcdef0123456789abcdef", "Tautulli API Key = [redacted]"],
    ['client_secret: "correct horse battery"', 'client_secret: "[redacted]"'],
    [String.raw`password: \"hunter2\"`, String.raw`password: \"[redacted]\"`],
    ["password: 'hunter2'", "password: '[redacted]'"],
    // JSON, escaped JSON at any depth, and dict style
    ['Request failed: {"X-Plex-Token":"Zq9PlexTok3nXyz12"}', 'Request failed: {"X-Plex-Token":"[redacted]"}'],
    ['{"apiKey" : "a\\"b"}', '{"apiKey" : "[redacted]"}'],
    [String.raw`{\"apiKey\":\"0123456789abcdef0123456789abcdef\"}`, String.raw`{\"apiKey\":\"[redacted]\"}`],
    [String.raw`{\"password\":\"pa\\\"ss\",\"title\":\"Dune\"}`, String.raw`{\"password\":\"[redacted]\",\"title\":\"Dune\"}`],
    [String.raw`{\\\"apiKey\\\":\\\"0123abcd\\\"}`, String.raw`{\\\"apiKey\\\":\\\"[redacted]\\\"}`],
    ["{'apikey': '0123456789abcdef0123456789abcdef'}", "{'apikey': '[redacted]'}"],
    ["{'passkey': 'a\\'b'}", "{'passkey': '[redacted]'}"],
    // A value cut short at the end of the text
    ['{"apiKey":"0123456789abcd', '{"apiKey":"[redacted]'],
    ['{"apiKey":"0123\\', '{"apiKey":"[redacted]\\'],
    [String.raw`{\"apiKey\":\"0123`, String.raw`{\"apiKey\":\"[redacted]`],
    ["{'apikey': '0123", "{'apikey': '[redacted]"],
    ['apikey="0123', 'apikey="[redacted]'],
    // Percent-encoded once or twice, ending at an encoded "&"
    [
      "magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&tr=http%3A%2F%2Ftracker.example%2Fannounce.php%3Fpasskey%3D0123456789abcdef",
      "magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&tr=http%3A%2F%2Ftracker.example%2Fannounce.php%3Fpasskey%3D[redacted]",
    ],
    ["http://app/login?next=%2Fapi%3Fapikey%3D0123456789abcdef%26x%3D1", "http://app/login?next=%2Fapi%3Fapikey%3D[redacted]%26x%3D1"],
    ["http://app/login?next=%252Fapi%253Fapikey%253D0123456789abcdef%2526x%253D1", "http://app/login?next=%252Fapi%253Fapikey%253D[redacted]%2526x%253D1"],
    // Percent-encoding's hex digits in lower case (RFC 3986 2.1)
    ["announce.php%3fpasskey%3d0123456789abcdef", "announce.php%3fpasskey%3d[redacted]"],
    ["next=%252fapi%253fapikey%253d0123456789abcdef%2526x", "next=%252fapi%253fapikey%253d[redacted]%2526x"],
    // A scheme after "=" goes with its credential
    ["token=Bearer abc123def456", "token=Bearer [redacted]"],
    ["token=bearer eyJhbGciOi.J9", "token=bearer [redacted]"],
  ])("%s", (text, expected) => {
    expect(redactText(text)).toBe(expected)
  })

  it.each([
    "max_tokens=4096",
    "Called with max_tokens=4096",
    '{"maxTokens": 4096, "tokenCount": 42, "promptTokens":"120"}',
    "{'maxTokens': 4096, 'tokenCount': 42}",
    "tokenCount: 42",
    "tokenizer: cl100k_base",
    "passwordMinLength: 8",
    "X-Plex-Token: missing",
    "X-Plex-Token: (none)",
    "Plex token: expired",
    "Password: ********",
    "Token count: 42",
    "token=",
    '"apiKey": ""',
    "the token was revoked",
    // An error code in capitals, an apostrophe that opens no quote, and a key named in words without one
    "Cannot decrypt a stored secret: KEY_UNKNOWN (kid gone)",
    "Secret: 'Tis the season, said the elf. Nothing else to report here.",
    "API key: required",
  ])("keeps %s", (text) => {
    expect(redactText(text)).toBe(text)
  })
})

describe("redactText: Authorization headers", () => {
  it.each([
    // Any letter case, and any prefix ending in "-"
    ["authorization=bearer Zq9PlexTok3nXyz12", "authorization=bearer [redacted]"],
    ["Authorization: bearer Zq9PlexTok3nXyz12", "Authorization: bearer [redacted]"],
    ["AUTHORIZATION: BASIC dXNlcjpwYXNzd29yZA==", "AUTHORIZATION: BASIC [redacted]"],
    ["AUTHORIZATION: Bearer abcdefghijklmnop", "AUTHORIZATION: Bearer [redacted]"],
    ["Proxy-Authorization: Basic dXNlcjpwYXNzd29yZA==", "Proxy-Authorization: Basic [redacted]"],
    ["Authorization Bearer abcdefghijklmnop", "Authorization Bearer [redacted]"],
    ["Authorization=Bearer abcdefghijklmnop", "Authorization=Bearer [redacted]"],
    ["headers: authorization=Basic dXNlcjpwYXNzd29yZA== host=sonarr", "headers: authorization=Basic [redacted] host=sonarr"],
    // Other schemes, one token or an auth-param list
    [`Authorization: Bot ${DISCORD_BOT_TOKEN}`, "Authorization: Bot [redacted]"],
    ["Authorization=Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b", "Authorization=Token [redacted]"],
    ["authorization: token ghp_16C7e42F292c6912E7710c838347Ae178B4a", "authorization: token [redacted]"],
    ['Authorization: MediaBrowser Token="0123456789abcdef0123456789abcdef"', "Authorization: MediaBrowser [redacted]"],
    [`Authorization: MediaBrowser ${JELLYFIN_PARAMS}`, "Authorization: MediaBrowser [redacted]"],
    [`X-Emby-Authorization: MediaBrowser ${JELLYFIN_PARAMS}`, "X-Emby-Authorization: MediaBrowser [redacted]"],
    ['Authorization: Digest username="Mufasa", realm="x@host.com", response="6629fae49393a05397450978507c4ef1"', "Authorization: Digest [redacted]"],
    [String.raw`sent Authorization: MediaBrowser Client=\"Plex Manager\", Token=\"0123abcd\" to jellyfin`, "sent Authorization: MediaBrowser [redacted] to jellyfin"],
    ["Authorization: Custom key='0123abcd', other=x", "Authorization: Custom [redacted]"],
    ["Authorization: Signature keyId=abc,signature=def123", "Authorization: Signature [redacted]"],
    ["Authorization: Custom token=ab,cd", "Authorization: Custom token=[redacted]"],
    ['Authorization: Custom token="cut short', "Authorization: Custom [redacted]"],
    ["authorization=Custom p@ss:w0rd!", "authorization=Custom [redacted]"],
    // Any other scheme with a token-shaped run
    ["Authorization: Custom 9944b09199c62bcf9418", "Authorization: Custom [redacted]"],
    ["Authorization Splunk AbCdEf0123456789xyz", "Authorization Splunk [redacted]"],
    // No scheme: after "=" whatever it is, after ":" when credential-shaped
    ["authorization=xyz", "authorization=[redacted]"],
    // A token after "=" is no scheme, so the token goes and the next field stays
    ["authorization=Zq9PlexTok3nXyz12 path=/library/sections", "authorization=[redacted] path=/library/sections"],
    ["AUTHORIZATION=sk_live_0123456789abcdefABCDEF next=1", "AUTHORIZATION=[redacted] next=1"],
    ['{"authorization":"Zq9PlexTok3nXyz12 expires 2026-11-30"}', '{"authorization":"[redacted]"}'],
    // After a space, a known scheme reads its auth-params
    ['Authorization Digest username="Mufasa", response="6629fae49393a05397450978507c4ef1"', "Authorization Digest [redacted]"],
    ["Authorization: 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b", "Authorization: [redacted]"],
    ["authorization%3DBearer%2520abc&x=1", "authorization%3D[redacted]&x=1"],
    // Quoted: JSON, escaped JSON and dict keys, or a quoted value
    ['{"Authorization": "Bearer abcdefghijklmnop"}', '{"Authorization": "Bearer [redacted]"}'],
    [String.raw`{\"Authorization\": \"Bearer abcdefghijklmnop\"}`, String.raw`{\"Authorization\": \"Bearer [redacted]\"}`],
    [String.raw`{\"Authorization\":\"MediaBrowser Client=\\\"Plex Manager\\\", Token=\\\"abc123def456\\\"\"} tail`, String.raw`{\"Authorization\":\"MediaBrowser [redacted]\"} tail`],
    ["{'Authorization': 'Bearer abcdefghijklmnop'}", "{'Authorization': 'Bearer [redacted]'}"],
    ['{"authorization": "9944b09199c62bcf"}', '{"authorization": "[redacted]"}'],
    ['authorization="Bearer abc def"', 'authorization="Bearer [redacted]"'],
    ["Authorization: 'Basic dXNlcjpwYXNz'", "Authorization: 'Basic [redacted]'"],
    [String.raw`authorization=\"Bearer abc\"`, String.raw`authorization=\"Bearer [redacted]\"`],
    ['curl -H "authorization: Basic abcdefghijkl" http://sonarr', 'curl -H "authorization: Basic [redacted]" http://sonarr'],
  ])("%s", (text, expected) => {
    expect(redactText(text)).toBe(expected)
  })

  it.each([
    "Authorization failed for user bob",
    "Authorization header missing",
    "Authorization: not configured",
    "Authorization: OAuth 2.0",
    "Authorization: Bearer",
    "Send it as Authorization: Bearer <token>",
    "Authorization basic training",
    "Authorization: basic training",
    "Authorization failed 2026-11-30T12:00:00Z for user",
    "Authorization failed reason=expired",
    "Authorization failed reason=expired, code=401",
    "Authorization: Failed 0x80070005",
    "Error: Authorization failed (code 0x80070005)",
    "authorization code flow",
    "/api/authorization/callback",
    "x_authorization: Bearer",
  ])("keeps %s", (text) => {
    expect(redactText(text)).toBe(text)
  })
})

describe("redactText: a bare Bearer or Basic", () => {
  it.each([
    ["Basic dXNlcjpwYXNz", "Basic [redacted]"],
    ["Bearer eyJhbGciOiJIUzI1NiJ9.a.b", "Bearer [redacted]"],
    ["Bearer sk-ant-api03-abcdef", "Bearer [redacted]"],
    ["Bearer abcdefghij.klmnop", "Bearer [redacted]"],
    // The credential ends where a pair's value would, not at @ : % ! ,
    ["Basic password=p@ssw0rd!", "Basic [redacted]"],
    ["Authorization: Bearer token=Zq9%2BPlexTok3n", "Authorization: Bearer [redacted]"],
    ["Bearer access_token=ya29.a0Af:H6SMxyz", "Bearer [redacted]"],
    ["Basic Zq9@PlexTok3n,more", "Basic [redacted]"],
    // Words joined by "-" are a credential, as before
    ["send Bearer raw-key.", "send Bearer [redacted]"],
    ["Bearer my-static-token", "Bearer [redacted]"],
    // Any letter case, when shaped like a token
    ["bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig", "bearer [redacted]"],
    ["BEARER eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0", "BEARER [redacted]"],
    ["bearer 0123456789abcdef0123456789abcdef", "bearer [redacted]"],
    ["basic dXNlcjpwYXNzd29yZA==", "basic [redacted]"],
    ["with bearer\tpmk_AbCdEf0123456789xyz", "with bearer\t[redacted]"],
  ])("%s", (text, expected) => {
    expect(redactText(text)).toBe(expected)
  })

  it.each([
    "Basic Instinct",
    "Basic Instinct 2",
    "Bearer Instruments Part One",
    "basic training",
    "We watched Basic Instinct.",
    "Basic Instinct, then Heat",
    "Basic Instinct (1992)",
    "Basic Instinct's sequel",
    "Basic Instinct’s sequel",
    "Basic Instinct,1992",
    "BASIC INSTINCT",
    "M*A*S*H - Basic Training",
    "Basic training is brutal",
    "basic read-only access",
    "Direct play supports basic H.264/AAC streams",
    "basic 1080p/2160p transcoding",
    "basic PlayStation-5 support",
    "bearer 2026-11-30",
    "Basic (non-premium) members",
    // A word then no token character, after Basic or Bearer as HTTP writes them
    "Basic Instinct(1992)",
    "Basic Training:Week-1",
    "Basic Instinct–Heat",
    // Where "basic" is English, "=" is no sign of a token, and a run with "/" is a list
    "basic user=admin;x=1",
    "basic quality=1080p",
    "Transcoder supports basic 4K/HDR10/DolbyVision",
    "Use HTTP Basic or Bearer authentication",
  ])("keeps %s", (text) => {
    expect(redactText(text)).toBe(text)
  })
})

describe("redactText: a password in a URL", () => {
  it.each([
    ["http://admin:hunter2pass@sonarr:8989/api/v3/series", "http://admin:[redacted]@sonarr:8989/api/v3/series"],
    ["redis://:s3cretP4ssw0rd@redis:6379/0", "redis://:[redacted]@redis:6379/0"],
    ["svn+ssh://jane:pa55@host/repo", "svn+ssh://jane:[redacted]@host/repo"],
  ])("%s", (text, expected) => {
    expect(redactText(text)).toBe(expected)
  })

  it.each(["https://sonarr.example.com:8989/api/v3/series", "ftp://user@host/file", "contact jane@example.com:22", "http://host:8080/path@v2"])(
    "keeps %s",
    (text) => {
      expect(redactText(text)).toBe(text)
    }
  )
})

describe("redactText", () => {
  it("replaces every credential in a text with the marker", () => {
    const text = 'Tool result: {"url":"http://plex:32400/x?X-Plex-Token=raw-plex","apiKey":"raw-key"} Authorization: Bearer abcdefgh12345678'

    expect(redactText(text)).toBe(`Tool result: {"url":"http://plex:32400/x?X-Plex-Token=${REDACTED}","apiKey":"${REDACTED}"} Authorization: Bearer ${REDACTED}`)
  })

  it("leaves a text with nothing to replace as it was", () => {
    expect(redactText("")).toBe("")
    expect(redactText("Marked Severance as finished")).toBe("Marked Severance as finished")
  })
})

describe("redactText time", () => {
  const LENGTH = 100_000
  /** `unit` repeated after `prefix` to 100,000 characters. */
  const long = (unit: string, prefix = "") => (prefix + unit.repeat(LENGTH / unit.length + 1)).slice(0, LENGTH)

  it.each([
    ["a run after Bearer", long("a", "Bearer ")],
    ["a run after lower-case bearer", long("aB", "bearer ")],
    ["hyphenated words after Bearer", long("ab-", "Bearer ")],
    ["apostrophes after Bearer", long("a’", "Bearer ")],
    ["spaces after Bearer", `${long(" ", "Bearer")}x`],
    ["many Bearers", long("Bearer a ")],
    ["a run after Authorization:", long("a", "Authorization: ")],
    ["a run after a scheme", long("a", "Authorization: Custom ")],
    ["an auth-param list", long('a="b", ', "Authorization: Digest ")],
    ["an unterminated auth-param", long("a", 'Authorization: Digest a="')],
    ["many Authorization:", long("Authorization: ")],
    ["a name run ending in authorization", `${long("x-")}authorization: abc`],
    ["an unterminated JSON value", long("a", '"apiKey": "')],
    ["an unterminated escaped value", long("a", String.raw`\"apiKey\":\"`)],
    ["an escaped value of backslashes", long("\\", String.raw`\"apiKey\":\"`)],
    ["an escaped value of escaped quotes", long(String.raw`\\\"`, String.raw`\"apiKey\":\"`)],
    ["escaped quotes", long(String.raw`\"`)],
    ["escaped names", long(String.raw`\"apiKey\":`)],
    ["quotes", long('"')],
    ["an unterminated dict value", long("a", "'apikey': '")],
    ["repeated pairs", long("token=a&")],
    ["repeated JSON pairs", long('"apiKey":"a",')],
    ["repeated loose pairs", long("token: a ")],
    ["%3D runs", long("%3D")],
    ["token%3D runs", long("token%3D")],
    ["%26 after an encoded pair", long("%26", "token%3D")],
    ["%253D runs", long("%253D", "apikey")],
    ["a long name before =", `${long("a")}token=x`],
    ["lists after loose pairs", long("token:a,")],
    ["API keys in words", long("API key: a ")],
    ["dotted words", long("a.")],
    ["URLs without a password", long("http://a:b/")],
    ["userinfo without an @", long("a", "http://user:")],
    ["unclosed single quotes after a secret", long("x ", "secret: '")],
  ])("reads %s of 100,000 characters in one pass", (_label, text) => {
    const start = performance.now()
    redactText(text)
    expect(performance.now() - start).toBeLessThan(100)
  })
})
