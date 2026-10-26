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

  it('leaves ordinary data alone', () => {
    const data = { title: 'Dune', year: 2021, sessions: [{ state: 'playing', progress: 0.4 }] }

    expect(JSON.parse(scrubForRole(JSON.stringify(data)))).toEqual(data)
  })
})
