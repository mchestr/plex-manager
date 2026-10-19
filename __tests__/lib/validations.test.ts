import { overseerrSchema, type OverseerrInput } from '@/lib/validations/overseerr'
import { plexServerSchema, type PlexServerInput } from '@/lib/validations/plex'
import { tautulliSchema, type TautulliInput } from '@/lib/validations/tautulli'

describe('plexServerSchema', () => {
  it('should validate valid Plex server data', () => {
    const valid: PlexServerInput = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:32400',
      token: 'abc123token',
    }
    expect(() => plexServerSchema.parse(valid)).not.toThrow()
  })

  it('should parse URL correctly', () => {
    const data = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:32400',
      token: 'abc123token',
    }
    const result = plexServerSchema.parse(data)
    expect(result.url).toBe('https://plex.example.com:32400')
  })

  it('should default to https when protocol is missing', () => {
    const data = {
      name: 'My Plex Server',
      url: 'plex.example.com:32400',
      token: 'abc123token',
    }
    const result = plexServerSchema.parse(data)
    // parseServerUrl defaults to https, so the URL should be normalized
    expect(result.url).toContain('https://')
  })

  it('should reject empty name', () => {
    const invalid = {
      name: '',
      url: 'https://plex.example.com:32400',
      token: 'abc123token',
    }
    expect(() => plexServerSchema.parse(invalid)).toThrow()
  })

  it('should reject empty url', () => {
    const invalid = {
      name: 'My Plex Server',
      url: '',
      token: 'abc123token',
    }
    expect(() => plexServerSchema.parse(invalid)).toThrow()
  })

  it('should reject empty token', () => {
    const invalid = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:32400',
      token: '',
    }
    expect(() => plexServerSchema.parse(invalid)).toThrow()
  })

  it('should reject invalid port (too low)', () => {
    const invalid = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:0',
      token: 'abc123token',
    }
    expect(() => plexServerSchema.parse(invalid)).toThrow()
  })

  it('should reject invalid port (too high)', () => {
    const invalid = {
      name: 'My Plex Server',
      url: 'https://plex.example.com:65536',
      token: 'abc123token',
    }
    expect(() => plexServerSchema.parse(invalid)).toThrow()
  })

  it('should reject invalid protocol', () => {
    const invalid = {
      name: 'My Plex Server',
      url: 'ftp://plex.example.com:32400',
      token: 'abc123token',
    }
    expect(() => plexServerSchema.parse(invalid)).toThrow('Invalid URL format')
  })
})

describe('tautulliSchema', () => {
  it('should validate valid Tautulli data', () => {
    const valid: TautulliInput = {
      name: 'My Tautulli',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'abc123key',
    }
    expect(() => tautulliSchema.parse(valid)).not.toThrow()
  })

  it('should parse URL correctly', () => {
    const data = {
      name: 'My Tautulli',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'abc123key',
    }
    const result = tautulliSchema.parse(data)
    expect(result.url).toBe('http://tautulli.example.com:8181')
  })

  it('should default to https when protocol is missing', () => {
    const data = {
      name: 'My Tautulli',
      url: 'tautulli.example.com:8181',
      apiKey: 'abc123key',
    }
    const result = tautulliSchema.parse(data)
    // parseServerUrl defaults to https, so the URL should be normalized
    expect(result.url).toContain('https://')
  })

  it('should reject empty name', () => {
    const invalid = {
      name: '',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'abc123key',
    }
    expect(() => tautulliSchema.parse(invalid)).toThrow()
  })

  it('should reject empty apiKey', () => {
    const invalid = {
      name: 'My Tautulli',
      url: 'http://tautulli.example.com:8181',
      apiKey: '',
    }
    expect(() => tautulliSchema.parse(invalid)).toThrow()
  })
})

describe('overseerrSchema', () => {
  it('should validate valid Overseerr data', () => {
    const valid: OverseerrInput = {
      name: 'My Overseerr',
      url: 'http://overseerr.example.com:5055',
      apiKey: 'abc123key',
    }
    expect(() => overseerrSchema.parse(valid)).not.toThrow()
  })

  it('should parse URL correctly', () => {
    const data = {
      name: 'My Overseerr',
      url: 'http://overseerr.example.com:5055',
      apiKey: 'abc123key',
    }
    const result = overseerrSchema.parse(data)
    expect(result.url).toBe('http://overseerr.example.com:5055')
  })

  it('should default to https when protocol is missing', () => {
    const data = {
      name: 'My Overseerr',
      url: 'overseerr.example.com:5055',
      apiKey: 'abc123key',
    }
    const result = overseerrSchema.parse(data)
    // parseServerUrl defaults to https, so the URL should be normalized
    expect(result.url).toContain('https://')
  })

  it('should reject empty name', () => {
    const invalid = {
      name: '',
      url: 'http://overseerr.example.com:5055',
      apiKey: 'abc123key',
    }
    expect(() => overseerrSchema.parse(invalid)).toThrow()
  })

  it('should reject empty apiKey', () => {
    const invalid = {
      name: 'My Overseerr',
      url: 'http://overseerr.example.com:5055',
      apiKey: '',
    }
    expect(() => overseerrSchema.parse(invalid)).toThrow()
  })
})
