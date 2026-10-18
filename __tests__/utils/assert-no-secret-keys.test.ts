import { assertNoSecretKeys, findSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'

describe('assertNoSecretKeys', () => {
  it('passes a value with only public keys', () => {
    expect(() =>
      assertNoSecretKeys({ id: 'i1', usages: [{ user: { name: 'Ann', email: 'a@example.com', image: null } }] })
    ).not.toThrow()
  })

  it('reports nested secret keys with their paths', () => {
    const value = {
      usages: [{ user: { name: 'Ann', plexAuthToken: 't' } }],
      server: { apiKey: 'k', clientSecret: 's' },
      password: 'p',
    }

    expect(findSecretKeys(value)).toEqual([
      '$.usages[0].user.plexAuthToken',
      '$.server.apiKey',
      '$.server.clientSecret',
      '$.password',
    ])
    expect(() => assertNoSecretKeys(value)).toThrow(
      'Secret-looking keys found: $.usages[0].user.plexAuthToken, $.server.apiKey, $.server.clientSecret, $.password'
    )
  })

  it('matches key names case-insensitively, even when the value is null', () => {
    expect(findSecretKeys({ ACCESS_TOKEN: null, botToken: undefined, StripeWebhookSecret: '' })).toEqual([
      '$.ACCESS_TOKEN',
      '$.botToken',
      '$.StripeWebhookSecret',
    ])
  })

  it('allows shareToken and nextToken', () => {
    expect(() => assertNoSecretKeys({ shareToken: 'slug', page: { nextToken: 'cursor' } })).not.toThrow()
  })

  it('ignores scalars, Dates and repeated references', () => {
    const shared = { name: 'Ann' }
    const cyclic: Record<string, unknown> = { shared, again: shared, at: new Date() }
    cyclic.self = cyclic

    expect(() => assertNoSecretKeys(cyclic)).not.toThrow()
    expect(() => assertNoSecretKeys('token')).not.toThrow()
    expect(() => assertNoSecretKeys(null)).not.toThrow()
  })
})
