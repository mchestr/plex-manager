/**
 * The settings page's groups and the sections in each: one source for the
 * nav, the Jump to Select and the page's group order.
 */

import {
  SECTION_HEALTH_KEYS,
  SETTINGS_GROUPS,
  settingsNavItems,
  type SettingsNavStatuses,
} from '@/components/admin/settings/settings-groups'

const STATUS: SettingsNavStatuses = {
  plex: 'ok',
  tautulli: 'unreachable',
  overseerr: 'notConfigured',
  other: 'incomplete',
  stripe: 'disabled',
}

describe('settings groups', () => {
  it('lists the three groups in nav order', () => {
    expect(SETTINGS_GROUPS.map((group) => group.id)).toEqual(['connections', 'billing', 'system'])
    expect(SETTINGS_GROUPS.map((group) => group.label)).toEqual(['Connections', 'Billing', 'System'])
  })

  it('puts each section in its group', () => {
    const items = settingsNavItems(STATUS)
    const labelsIn = (group: string) => items.filter((item) => item.group === group).map((item) => item.label)

    expect(Object.fromEntries(SETTINGS_GROUPS.map((group) => [group.id, labelsIn(group.id)]))).toEqual({
      connections: ['Plex server', 'Tautulli', 'Overseerr', 'Sonarr, Radarr'],
      billing: ['Stripe billing'],
      system: ['Appearance', 'Logos and images', 'Time zone', 'API access', 'Privacy', 'System information'],
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
      'appearance',
      'brand-images',
      'time-zone',
      'api-access',
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
      appearance: undefined,
      'brand-images': undefined,
      'time-zone': undefined,
      'api-access': undefined,
      privacy: undefined,
      system: undefined,
    })
  })

  it('names the health checks behind exactly the sections that have a status', () => {
    const checked = settingsNavItems(STATUS)
      .filter((item) => item.status !== undefined)
      .map((item) => item.id)

    expect(Object.keys(SECTION_HEALTH_KEYS).sort()).toEqual(checked.sort())
    expect(SECTION_HEALTH_KEYS.other).toEqual(['sonarr', 'radarr'])
  })
})
