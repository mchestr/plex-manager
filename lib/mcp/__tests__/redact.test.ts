/**
 * @jest-environment node
 */
import { isCredentialKey, REDACTED, redactCredentials } from '@/lib/mcp/redact'

/** Discord's documented example bot token, built from its parts so secret scanning does not take it for a leak. */
const DISCORD_BOT_TOKEN = ['MTk4NjIyNDgzNDcxOTI1MjQ4', 'Cl2FMQ', 'ZnCjm1XVW7vRze4b7Cq4se7kKWs'].join('.')

const redacted = (value: unknown) => JSON.parse(redactCredentials(JSON.stringify(value)).text)

describe('isCredentialKey', () => {
  it.each([
    'apiKey', 'api_key', 'API-KEY', 'token', 'X-Plex-Token', 'plexAuthToken', 'shareToken', 'accessToken', 'server_token',
    'clientSecret', 'stripeWebhookSecret', 'password', 'passkey', 'authorization', 'cookie', 'credentials', 'assetKey',
    'rewindSerialKey', 'affiliateBlockKey', 'authHeaderSecret', 'privateKey', 'accessKey', 'session_key',
  ])('%s is a credential', (key) => {
    expect(isCredentialKey(key)).toBe(true)
  })

  it.each(['promptTokens', 'totalTokens', 'maxTokens', 'tokenCount', 'prompt', 'response', 'title', 'content', 'code', 'url', 'email', 'id'])(
    '%s is not',
    (key) => {
      expect(isCredentialKey(key)).toBe(false)
    }
  )
})

describe('redactCredentials', () => {
  it('replaces credential strings at any depth', () => {
    expect(
      redacted({
        data: { servers: [{ name: 'Sonarr', apiKey: 'raw-key' }], plex: { 'X-Plex-Token': 'raw-plex' }, rewind: { shareToken: 'raw-share' } },
      })
    ).toEqual({ data: { servers: [{ name: 'Sonarr', apiKey: REDACTED }], plex: { 'X-Plex-Token': REDACTED }, rewind: { shareToken: REDACTED } } })
  })

  it('masks a credential in a URL inside any string, such as a grabbed release', () => {
    const out = redacted({
      records: [{ eventType: 'grabbed', data: { downloadUrl: 'http://prowlarr:9696/1/download?apikey=raw-indexer&link=abc&passkey=raw-pass' } }],
    })
    expect(out.records[0].data.downloadUrl).toBe(`http://prowlarr:9696/1/download?apikey=${REDACTED}&link=abc&passkey=${REDACTED}`)
  })

  it('masks credentials in free text: a query string, JSON written into a string and a Bearer value', () => {
    const prompt = 'Tool result: {"url":"http://plex:32400/x?X-Plex-Token=raw-plex","apiKey":"raw-key"} Authorization: Bearer abcdefgh12345678'
    const out = redacted({ prompt, promptTokens: 1200 })
    expect(out.prompt).not.toMatch(/raw-|abcdefgh12345678/)
    expect(out.prompt).toContain(`X-Plex-Token=${REDACTED}`)
    expect(out.prompt).toContain(`"apiKey":"${REDACTED}"`)
    expect(out.prompt).toContain(`Bearer ${REDACTED}`)
    expect(out.promptTokens).toBe(1200)
  })

  it('keeps counts named like tokens readable inside strings', () => {
    const prompt = 'Called with max_tokens=4096 and {"promptTokens":"120"}; key at ?api_key=raw-key'
    const out = redacted({ prompt })
    expect(out.prompt).toContain('max_tokens=4096')
    expect(out.prompt).toContain('"promptTokens":"120"')
    expect(out.prompt).toContain(`api_key=${REDACTED}`)
  })

  it('leaves a masked description, a field error list, an empty value and counts alone', () => {
    const text = JSON.stringify({
      apiKey: { last4: 'a1b2', origin: 'https://sonarr.example.com' },
      fieldErrors: { apiKey: ['API key is required'] },
      token: '',
      totalTokens: 900,
    })
    expect(redactCredentials(text)).toEqual({ text, redacted: false })
  })

  it('keeps the original text when nothing changes', () => {
    const text = '{ "a": 1,\n  "b": "two" }'
    expect(redactCredentials(text)).toEqual({ text, redacted: false })
  })

  it('applies the string rules to text that is not JSON', () => {
    expect(redactCredentials('Marked Severance as finished')).toEqual({ text: 'Marked Severance as finished', redacted: false })
    expect(redactCredentials('see http://sonarr/feed?apikey=raw-key')).toEqual({ text: `see http://sonarr/feed?apikey=${REDACTED}`, redacted: true })
  })

  it.each([
    'Basic Instinct',
    'Basic Instinct 2',
    'M*A*S*H - Basic Training',
    'Basic training is brutal',
    'Bearer Instruments Part One',
    'We watched Basic Instinct.',
    'Basic Instinct (1992)',
    'basic training',
    'Basic Instinct, then Heat',
    "Basic Instinct's sequel",
    'Basic Instinct’s sequel',
    'BASIC INSTINCT',
  ])('keeps the title "%s"', (title) => {
    const text = JSON.stringify({ title, episodeTitle: title, showing: `showing 1 of 1 results for "${title}"` })
    expect(redactCredentials(text)).toEqual({ text, redacted: false })
  })

  it.each([
    ['Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
    ['Bearer eyJhbGciOiJIUzI1NiJ9.a.b', 'eyJhbGciOiJIUzI1NiJ9'],
    ['Bearer sk-ant-api03-abcdef', 'sk-ant-api03-abcdef'],
    ['Bearer abcdefghij.klmnop', 'abcdefghij.klmnop'],
    ['Authorization: Bearer abcdefghijklmnop', 'abcdefghijklmnop'],
    ['Authorization Bearer abcdefghijklmnop', 'abcdefghijklmnop'],
    ['curl -H "authorization: Basic abcdefghijkl" http://sonarr', 'abcdefghijkl'],
  ])('redacts the credential in "%s"', (note, secret) => {
    const { text, redacted } = redactCredentials(JSON.stringify({ note }))
    expect(redacted).toBe(true)
    expect(text).not.toContain(secret)
    expect(JSON.parse(text).note).toMatch(/(Bearer|Basic) \[redacted\]/)
  })

  it.each([
    ['Authorization=Bearer abcdefghijklmnop', 'abcdefghijklmnop'],
    ['headers: authorization=Basic dXNlcjpwYXNzd29yZA== host=sonarr', 'dXNlcjpwYXNzd29yZA'],
  ])('redacts the token after an "Authorization=" scheme in "%s"', (note, secret) => {
    const { text, redacted } = redactCredentials(JSON.stringify({ note }))
    expect(redacted).toBe(true)
    expect(text).not.toContain(secret)
    expect(redactCredentials(note).text).not.toContain(secret)
  })

  it.each([
    // Any letter case
    ['authorization=bearer Zq9PlexTok3nXyz12', 'authorization=bearer [redacted]'],
    ['Authorization: bearer Zq9PlexTok3nXyz12', 'Authorization: bearer [redacted]'],
    ['AUTHORIZATION: BASIC dXNlcjpwYXNzd29yZA==', 'AUTHORIZATION: BASIC [redacted]'],
    ['AUTHORIZATION: Bearer abcdefghijklmnop', 'AUTHORIZATION: Bearer [redacted]'],
    // Other schemes and prefixed header names
    ['Authorization: MediaBrowser Token="0123456789abcdef0123456789abcdef"', 'Authorization: MediaBrowser [redacted]'],
    [
      'Authorization: MediaBrowser Client="Plex Manager", Device="Server", DeviceId="abc", Version="1.2.3", Token="0123456789abcdef0123456789abcdef"',
      'Authorization: MediaBrowser [redacted]',
    ],
    [`Authorization: Bot ${DISCORD_BOT_TOKEN}`, 'Authorization: Bot [redacted]'],
    ['Authorization=Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b', 'Authorization=Token [redacted]'],
    ['Proxy-Authorization: Basic dXNlcjpwYXNzd29yZA==', 'Proxy-Authorization: Basic [redacted]'],
    ['X-Emby-Authorization: MediaBrowser Token="0123456789abcdef"', 'X-Emby-Authorization: MediaBrowser [redacted]'],
    // Pair shapes
    ['curl -H "X-Plex-Token: Zq9PlexTok3nXyz12" http://plex:32400/library/sections', 'curl -H "X-Plex-Token: [redacted]" http://plex:32400/library/sections'],
    ['curl -H "X-Api-Key: 0123456789abcdef0123456789abcdef" http://sonarr:8989/api/v3/series', 'curl -H "X-Api-Key: [redacted]" http://sonarr:8989/api/v3/series'],
    ['apikey="0123456789abcdef0123456789abcdef"', 'apikey="[redacted]"'],
    ['password = hunter2hunter2', 'password = [redacted]'],
    [String.raw`{\"apiKey\":\"0123456789abcdef0123456789abcdef\"}`, String.raw`{\"apiKey\":\"[redacted]\"}`],
    ["{'apikey': '0123456789abcdef0123456789abcdef'}", "{'apikey': '[redacted]'}"],
    ['Request failed: {"X-Plex-Token":"Zq9PlexTok3nXyz12"}', 'Request failed: {"X-Plex-Token":"[redacted]"}'],
    // Percent-encoded pairs
    [
      'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&tr=http%3A%2F%2Ftracker.example%2Fannounce.php%3Fpasskey%3D0123456789abcdef',
      'magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&tr=http%3A%2F%2Ftracker.example%2Fannounce.php%3Fpasskey%3D[redacted]',
    ],
    ['http://app/login?next=%2Fapi%3Fapikey%3D0123456789abcdef%26x%3D1', 'http://app/login?next=%2Fapi%3Fapikey%3D[redacted]%26x%3D1'],
    ['http://app/login?next=%252Fapi%253Fapikey%253D0123456789abcdef%2526x%253D1', 'http://app/login?next=%252Fapi%253Fapikey%253D[redacted]%2526x%253D1'],
    // A scheme's credential runs on past @ : % ! ,
    ['Basic password=p@ssw0rd!', 'Basic [redacted]'],
    ['Authorization: Bearer token=Zq9%2BPlexTok3n', 'Authorization: Bearer [redacted]'],
    ['Bearer access_token=ya29.a0Af:H6SMxyz', 'Bearer [redacted]'],
  ])('redacts "%s" in plain text and in a JSON string', (text, expected) => {
    expect(redactCredentials(text)).toEqual({ text: expected, redacted: true })
    expect(redacted({ note: text }).note).toBe(expected)
  })

  it('keeps counts in JSON written into a string', () => {
    const text = JSON.stringify({ prompt: '{"maxTokens": 4096, "tokenCount": 42, "promptTokens":"120"}' })
    expect(redactCredentials(text)).toEqual({ text, redacted: false })
  })

  it.each([
    ['a "token-" run', 'token-'.repeat(3_400)],
    ['a "token_token-" run', 'token_token-'.repeat(1_700)],
    ['a quoted "token-" run', `"${'token-'.repeat(3_400)}`],
  ])('reads %s of 20,000 characters in one pass', (_label, value) => {
    const start = performance.now()
    redactCredentials(JSON.stringify({ player: value }))
    redactCredentials(value)
    expect(performance.now() - start).toBeLessThan(100)
  })
})
