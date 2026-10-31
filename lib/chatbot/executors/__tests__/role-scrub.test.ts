jest.mock('server-only', () => ({}))

import { REDACTED, scrubForRole } from '@/lib/chatbot/executors/role-scrub'

/** Discord's documented example bot token, built from its parts so secret scanning does not take it for a leak. */
const DISCORD_BOT_TOKEN = ['MTk4NjIyNDgzNDcxOTI1MjQ4', 'Cl2FMQ', 'ZnCjm1XVW7vRze4b7Cq4se7kKWs'].join('.')

describe('scrubForRole', () => {
  it('drops credential keys at any depth, whatever their spelling', () => {
    const output = JSON.stringify({
      MediaContainer: {
        Server: [{ name: 'Home', accessToken: 'aaa', 'X-Plex-Token': 'bbb' }],
        settings: { api_key: 'ccc', apiKey: 'ddd', Password: 'eee', clientSecret: 'fff', Authorization: 'ggg' },
        title: 'Keep me',
      },
    })

    const result = scrubForRole(output)

    expect(JSON.parse(result)).toEqual({ MediaContainer: { Server: [{ name: 'Home' }], settings: {}, title: 'Keep me' } })
    for (const secret of ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg']) expect(result).not.toContain(secret)
  })

  it('drops the personal fields every tool already strips for admins', () => {
    const result = scrubForRole(JSON.stringify({ users: [{ friendly_name: 'Sam', email: 'sam@example.com', ip_address: '10.0.0.4' }] }))

    expect(JSON.parse(result)).toEqual({ users: [{ friendly_name: 'Sam' }] })
  })

  it('redacts credentials inside strings', () => {
    const result = scrubForRole(
      JSON.stringify({
        thumb: 'http://plex:32400/library/x?X-Plex-Token=abc123&size=2',
        url: 'http://sonarr:8989/api?apikey=k3y',
        note: 'Authorization: Bearer abcdefghijklmnop',
      })
    )

    expect(result).not.toMatch(/abc123|k3y|abcdefghijklmnop/)
    expect(result).toContain(`X-Plex-Token=${REDACTED}`)
    expect(result).toContain('size=2')
  })

  it('scrubs plain-text output too', () => {
    expect(scrubForRole('Marked. See http://x/y?token=secret-1')).toBe(`Marked. See http://x/y?token=${REDACTED}`)
  })

  it("redacts a tracker's passkey in a URL", () => {
    expect(scrubForRole('{"downloadUrl":"http://tracker/dl/1?passkey=raw-pass&id=2"}')).toBe(`{"downloadUrl":"http://tracker/dl/1?passkey=${REDACTED}&id=2"}`)
  })

  it('leaves ordinary data alone', () => {
    const data = { title: 'Dune', year: 2021, sessions: [{ state: 'playing', progress: 0.4 }] }

    expect(JSON.parse(scrubForRole(JSON.stringify(data)))).toEqual(data)
  })

  it('keeps titles that start with Basic or Bearer', () => {
    const titles = [
      'Basic Instinct', 'Basic Instinct 2', 'M*A*S*H - Basic Training', 'Bearer Instruments Part One', 'We watched Basic Instinct.',
      'basic training', 'Basic Instinct, then Heat', 'Basic Instinct (1992)', "Basic Instinct's sequel", 'BASIC INSTINCT',
    ]
    const data = {
      records: titles.map((title) => ({ title })),
      showing: 'showing 1 of 1 results for "Basic Instinct"',
    }

    expect(JSON.parse(scrubForRole(JSON.stringify(data)))).toEqual(data)
    for (const title of titles) expect(scrubForRole(title)).toBe(title)
  })

  it('keeps counts in JSON written into a string', () => {
    const data = { prompt: '{"maxTokens": 4096, "tokenCount": 42, "promptTokens":"120"} max_tokens=4096' }

    expect(JSON.parse(scrubForRole(JSON.stringify(data)))).toEqual(data)
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
    // A "name": "value" pair, which this scrubber had no rule for
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
    expect(scrubForRole(text)).toBe(expected)
    expect(JSON.parse(scrubForRole(JSON.stringify({ note: text }))).note).toBe(expected)
  })

  it.each([
    ['Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
    ['Bearer eyJhbGciOiJIUzI1NiJ9.a.b', 'eyJhbGciOiJIUzI1NiJ9'],
    ['Bearer sk-ant-api03-abcdef', 'sk-ant-api03-abcdef'],
    ['{"Authorization": "Bearer abcdefghijklmnop"}', 'abcdefghijklmnop'],
    ['authorization: Basic abcdefghijkl', 'abcdefghijkl'],
  ])('redacts a credential-shaped value in "%s"', (note, secret) => {
    const result = scrubForRole(JSON.stringify({ note }))

    expect(result).not.toContain(secret)
    expect(JSON.parse(result).note).toMatch(/(Bearer|Basic) \[redacted\]/)
  })

  it.each([
    ['Authorization=Bearer abcdefghijklmnop', 'abcdefghijklmnop'],
    ['headers: authorization=Basic dXNlcjpwYXNzd29yZA== host=sonarr', 'dXNlcjpwYXNzd29yZA'],
  ])('redacts the token after an "Authorization=" scheme in "%s"', (note, secret) => {
    const result = scrubForRole(JSON.stringify({ note }))

    expect(result).not.toContain(secret)
    expect(JSON.parse(result).note).toContain(REDACTED)
  })

  it('reads a 20,000-character "token-" run in one pass', () => {
    const run = 'token-'.repeat(3_400)
    const start = performance.now()

    scrubForRole(JSON.stringify({ player: run }))
    scrubForRole(run)

    expect(performance.now() - start).toBeLessThan(100)
  })
})

describe('scrubForRole failures', () => {
  it('redacts a plain-text result with a Plex URL and a Bearer header', () => {
    const result = scrubForRole('See http://plex:32400/x?X-Plex-Token=abc123 with Authorization Bearer abcdefghijklmnop')

    expect(result).not.toMatch(/abc123|abcdefghijklmnop/)
  })

  it('never returns the raw output when scrubbing parsed data throws', () => {
    const input = JSON.stringify({ apikey: 'k3y' })
    const parse = jest.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new Error('boom')
    })

    const result = scrubForRole(input)

    parse.mockRestore()
    expect(result).toBe("Error: that tool isn't available right now.")
  })
})
