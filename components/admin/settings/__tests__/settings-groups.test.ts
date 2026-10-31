/**
 * The settings page's groups and the sections in each: one source for the
 * nav, the Jump to Select and the page's group order.
 */

import { SETTINGS_GROUPS, settingsNavItems, type SettingsNavStatuses } from '@/components/admin/settings/settings-groups'

const STATUS: SettingsNavStatuses = {
  plex: 'ok',
  tautulli: 'unreachable',
  overseerr: 'notConfigured',
  other: 'incomplete',
  stripe: 'disabled',
  ai: 'degraded',
  discord: 'untested',
  rewind: 'ok',
}

describe('settings groups', () => {
  it('lists the six groups in nav order', () => {
    expect(SETTINGS_GROUPS.map((group) => group.label)).toEqual(['Media', 'Members', 'AI', 'Discord', 'Rewind', 'System'])
  })

  it('puts each section in its group', () => {
    const items = settingsNavItems(STATUS)
    const labelsIn = (group: string) => items.filter((item) => item.group === group).map((item) => item.label)

    expect(Object.fromEntries(SETTINGS_GROUPS.map((group) => [group.id, labelsIn(group.id)]))).toEqual({
      media: ['Plex server', 'Tautulli', 'Overseerr', 'Sonarr, Radarr, Jellyfin'],
      members: ['Stripe billing', 'Request limits'],
      ai: ['AI provider', 'Assistant sources'],
      discord: ['Discord', 'Channel stats'],
      rewind: ['Rewind'],
      system: ['Time zone', 'Privacy', 'System information'],
    })
  })

  it('lists the sections in page order, group by group, under their anchor ids', () => {
    const items = settingsNavItems(STATUS)
    const groupOrder = SETTINGS_GROUPS.map((group) => group.id)

    expect(items.map((item) => item.id)).toEqual([
      'plex',
      'tautulli',
      'overseerr',
      'other',
      'stripe',
      'request-tiers',
      'ai',
      'assistant',
      'discord',
      'channel-stats',
      'rewind',
      'time-zone',
      'privacy',
      'system',
    ])
    const groups = items.map((item) => groupOrder.indexOf(item.group))
    expect(groups).toEqual([...groups].sort((a, b) => a - b))
  })

  it('gives each checked section its status, and none to a section with nothing to check', () => {
    const statusOf = Object.fromEntries(settingsNavItems(STATUS).map((item) => [item.id, item.status]))

    expect(statusOf).toEqual({
      plex: 'ok',
      tautulli: 'unreachable',
      overseerr: 'notConfigured',
      other: 'incomplete',
      stripe: 'disabled',
      'request-tiers': undefined,
      ai: 'degraded',
      assistant: undefined,
      discord: 'untested',
      'channel-stats': undefined,
      rewind: 'ok',
      'time-zone': undefined,
      privacy: undefined,
      system: undefined,
    })
  })
})
