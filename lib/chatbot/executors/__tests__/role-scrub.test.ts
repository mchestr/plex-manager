jest.mock('server-only', () => ({}))

import { REDACTED, scrubForRole } from '@/lib/chatbot/executors/role-scrub'

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
    const data = {
      records: ['Basic Instinct', 'Basic Instinct 2', 'M*A*S*H - Basic Training', 'Bearer Instruments Part One', 'We watched Basic Instinct.'].map((title) => ({ title })),
      showing: 'showing 1 of 1 results for "Basic Instinct"',
    }

    expect(JSON.parse(scrubForRole(JSON.stringify(data)))).toEqual(data)
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
