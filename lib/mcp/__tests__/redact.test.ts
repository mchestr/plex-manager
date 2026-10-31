/**
 * @jest-environment node
 */
import { CREDENTIAL_KEYS, REDACTED, redactCredentials } from '@/lib/mcp/redact'

describe('CREDENTIAL_KEYS', () => {
  it('names every encrypted credential column and no free text', () => {
    expect([...CREDENTIAL_KEYS].sort()).toEqual(
      [
        'accessToken',
        'affiliateBlockKey',
        'apiKey',
        'authHeaderSecret',
        'botToken',
        'clientSecret',
        'plexAuthToken',
        'refreshToken',
        'rewindSerialKey',
        'stripeSecretKey',
        'stripeWebhookSecret',
        'token',
      ].sort()
    )
    for (const freeText of ['prompt', 'response', 'title', 'content']) expect(CREDENTIAL_KEYS.has(freeText)).toBe(false)
  })
})

describe('redactCredentials', () => {
  it('replaces a credential string at any depth', () => {
    const text = JSON.stringify({
      success: true,
      data: { servers: [{ name: 'Sonarr', apiKey: 'raw-sonarr-key' }], plex: { token: 'raw-plex-token' }, user: { plexAuthToken: 'raw-user-token' } },
    })

    const result = redactCredentials(text)

    expect(result.redacted).toBe(true)
    expect(result.text).not.toMatch(/raw-/)
    expect(JSON.parse(result.text).data).toEqual({
      servers: [{ name: 'Sonarr', apiKey: REDACTED }],
      plex: { token: REDACTED },
      user: { plexAuthToken: REDACTED },
    })
  })

  it('leaves a masked description, a field error list, an empty value and free text alone', () => {
    const text = JSON.stringify({
      apiKey: { last4: 'a1b2', origin: 'https://sonarr.example.com' },
      fieldErrors: { apiKey: ['API key is required'] },
      token: '',
      prompt: 'Write the Rewind',
      response: 'Here it is',
      promptTokens: 1200,
    })
    expect(redactCredentials(text)).toEqual({ text, redacted: false })
  })

  it('returns text that is not JSON as it is', () => {
    expect(redactCredentials('Marked Severance as finished')).toEqual({ text: 'Marked Severance as finished', redacted: false })
  })
})
