/**
 * DUP-11 (P11.5): the four API-key service schemas come from one factory and
 * parse exactly as the hand-written schemas did, and an announcement edit adds
 * no defaults.
 */

import { z } from 'zod'

import { announcementSchema, announcementUpdateSchema } from '@/lib/validations/announcement'
import { overseerrSchema } from '@/lib/validations/overseerr'
import { radarrSchema } from '@/lib/validations/radarr'
import { createPublicUrlSchema, createServerUrlSchema } from '@/lib/validations/shared-schemas'
import { sonarrSchema } from '@/lib/validations/sonarr'
import { tautulliSchema } from '@/lib/validations/tautulli'

/** The schema each service had before the factory. */
const before = (port: string, domain: string) =>
  z.object({
    name: z.string().min(1, 'Server name is required'),
    url: createServerUrlSchema(port),
    apiKey: z.string().min(1, 'API key is required'),
    publicUrl: createPublicUrlSchema(domain),
  })

const SERVICES = [
  ['sonarr', sonarrSchema, before('8989', 'sonarr.example.com')],
  ['radarr', radarrSchema, before('7878', 'radarr.example.com')],
  ['tautulli', tautulliSchema, before('8181', 'tautulli.example.com')],
  ['overseerr', overseerrSchema, before('5055', 'requests.example.com')],
] as const

const URLS = [
  'http://media.lan:8989',
  'http://media.lan:8989/',
  'https://media.example.com',
  'https://media.example.com:443',
  'http://10.0.0.5',
  'media.lan:7878',
  'ftp://media.lan',
  'javascript:alert(1)',
  '',
  'not a url',
]

const PUBLIC_URLS = [undefined, '', 'https://requests.example.com', 'javascript:alert(1)', 'nope']

describe.each(SERVICES)('%s schema', (_name, schema, legacy) => {
  it.each(URLS)('parses the server URL %p as before', (url) => {
    const input = { name: 'Server', url, apiKey: 'key' }
    expect(schema.safeParse(input)).toEqual(legacy.safeParse(input))
  })

  it.each(PUBLIC_URLS)('parses the public URL %p as before', (publicUrl) => {
    const input = { name: 'Server', url: 'http://media.lan', apiKey: 'key', publicUrl }
    expect(schema.safeParse(input)).toEqual(legacy.safeParse(input))
  })

  it('requires a name and a key with the same copy', () => {
    const input = { name: '', url: 'http://media.lan', apiKey: '' }
    expect(schema.safeParse(input)).toEqual(legacy.safeParse(input))
  })
})

describe('announcement schemas', () => {
  const fields = { title: 'Maintenance', content: 'Down at 2am' }

  it('creates with priority 0 and shown by default', () => {
    expect(announcementSchema.parse(fields)).toMatchObject({ priority: 0, isActive: true, expiresAt: null })
  })

  it('adds no defaults to an edit', () => {
    expect(announcementUpdateSchema.safeParse({ id: 'a1', ...fields }).success).toBe(false)
    expect(announcementUpdateSchema.parse({ id: 'a1', ...fields, priority: 5, isActive: false })).toEqual({
      id: 'a1',
      ...fields,
      priority: 5,
      isActive: false,
      expiresAt: null,
    })
  })
})
