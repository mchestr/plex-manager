/**
 * @jest-environment node
 */
import { isCredentialKey, REDACTED, redactCredentials } from '@/lib/mcp/redact'

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
})
