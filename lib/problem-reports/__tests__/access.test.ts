/**
 * readMemberItem: a member may report only titles in libraries shared with
 * them (SEC-21), checked on the server for every rating key.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildUser } from '@/__tests__/helpers/factories'
import { getPlexItemMetadata, type PlexItemMetadata } from '@/lib/connections/plex'
import { getActivePlexServerConfig } from '@/lib/connections/plex-config'
import { getSharedSectionKeys } from '@/lib/connections/plex-shared-sections'
import { readMemberItem } from '@/lib/problem-reports/access'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex', () => ({ getPlexItemMetadata: jest.fn() }))
jest.mock('@/lib/connections/plex-config', () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock('@/lib/connections/plex-shared-sections', () => ({ getSharedSectionKeys: jest.fn(), rememberItemSectionKey: jest.fn() }))

const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner-plex', machineIdentifier: 'machine' }
const ITEM: PlexItemMetadata = { ratingKey: '555', type: 'movie', title: 'Heat', year: 1995, guid: 'plex://movie/heat', ids: {}, librarySectionId: '1', media: [], locations: [] }

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: 'found', item: ITEM })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: 'member-plex', isAdmin: false }))
})

describe('readMemberItem', () => {
  it('reads an item in a section shared with the member', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set(['1']))

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: true, item: ITEM, server: SERVER })
    expect(getSharedSectionKeys).toHaveBeenCalledWith(SERVER, 'member-plex')
  })

  it('refuses an item in a section not shared with the member', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set(['2']))

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('refuses an item whose section the server did not say', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set(['1']))
    jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: 'found', item: { ...ITEM, librarySectionId: undefined } })

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it.each([
    ['an admin', buildUser({ id: 'member-1', plexUserId: 'member-plex', isAdmin: true })],
    ['the server owner', buildUser({ id: 'member-1', plexUserId: 'owner-plex', isAdmin: false })],
  ])('lets %s report any library without asking plex.tv', async (_label, user) => {
    prismaMock.user.findUnique.mockResolvedValue(user)

    expect(await readMemberItem('member-1', '555')).toMatchObject({ ok: true })
    expect(getSharedSectionKeys).not.toHaveBeenCalled()
  })

  it('reports plex.tv being unreadable as unavailable', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(null)

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: false, reason: 'UNAVAILABLE' })
  })

  it.each([
    ['a missing item', { status: 'missing' as const }, 'NOT_FOUND'],
    ['an unreadable server', { status: 'unknown' as const }, 'UNAVAILABLE'],
    ['a season', { status: 'found' as const, item: { ...ITEM, type: 'season' } }, 'NOT_FOUND'],
  ])('refuses %s', async (_label, lookup, reason) => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    jest.mocked(getPlexItemMetadata).mockResolvedValue(lookup)

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: false, reason })
  })

  it('refuses a member without a Plex account', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', plexUserId: null, isAdmin: false }))

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('reports no active Plex server as unavailable', async () => {
    jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)

    expect(await readMemberItem('member-1', '555')).toEqual({ ok: false, reason: 'UNAVAILABLE' })
  })
})
