/**
 * The admin nav context: the provider rebuilds the user's items from
 * `ADMIN_NAV` by id (icons are not serialisable), at the href the server
 * resolved for the user and with only the tabs the server let through.
 */

import { renderHook } from '@testing-library/react'
import type { Route } from 'next'
import type { ReactNode } from 'react'

import { AdminNavProvider, useAdminNav } from '@/components/shell/admin-nav-context'
import { ADMIN_NAV, type AdminNavItem } from '@/lib/admin/nav'
import type { AdminShellNavEntry } from '@/lib/admin/shell'

const byId = (id: string) => ADMIN_NAV.find((item) => item.id === id) as AdminNavItem

function renderNav(nav: AdminShellNavEntry[], scoped = false) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AdminNavProvider nav={nav} scoped={scoped}>
      {children}
    </AdminNavProvider>
  )
  return renderHook(() => useAdminNav(), { wrapper }).result.current
}

describe('useAdminNav', () => {
  it('is every item of the admin nav, tabs included, and unscoped, without a provider', () => {
    const { items, scoped } = renderHook(() => useAdminNav()).result.current

    expect(items).toBe(ADMIN_NAV)
    expect(scoped).toBe(false)
  })
})

describe('AdminNavProvider', () => {
  it('gives the items the server listed, in nav order, with the labels and icons of the admin nav', () => {
    const { items } = renderNav([
      { id: 'automations', href: '/admin/watchlist', childIds: [] },
      { id: 'announcements', href: '/admin/announcements', childIds: [] },
    ])

    expect(items.map((item) => item.id)).toEqual(['announcements', 'automations'])
    expect(items[0]).toMatchObject({ label: 'Announcements', icon: byId('announcements').icon })
    expect(items[1]).toMatchObject({ label: 'Automations', icon: byId('automations').icon, match: 'prefix', mobile: 'tab' })
  })

  it('opens an item at the href the server resolved for the user, and leaves the admin nav as it is', () => {
    const { items } = renderNav([{ id: 'automations', href: '/admin/queues', childIds: ['queues'] }])

    expect(items[0].href).toBe('/admin/queues')
    expect(byId('automations').href).toBe('/admin/watchlist')
  })

  it('keeps only the tabs the server let through, in nav order', () => {
    const { items } = renderNav([
      { id: 'automations', href: '/admin/watchlist', childIds: ['queues', 'watchlist'] },
      { id: 'ai', href: '/admin/ai', childIds: [] },
    ])

    const automations = items.find((item) => item.id === 'automations')
    expect(automations?.children?.map((child) => child.id)).toEqual(['watchlist', 'queues'])
    expect(automations?.children?.[1]).toEqual({ id: 'queues', label: 'Queues', href: '/admin/queues' })
    expect(items.find((item) => item.id === 'ai')?.children).toEqual([])
    expect(byId('automations').children).toHaveLength(4)
  })

  it('leaves an item without tabs without, whatever ids the server sends', () => {
    const { items } = renderNav([{ id: 'announcements', href: '/admin/announcements', childIds: ['announcements'] }])

    expect(items[0].children).toBeUndefined()
  })

  it('drops an id the admin nav does not have, and lists nothing the server did not', () => {
    const { items } = renderNav([
      { id: 'overview', href: '/admin', childIds: [] },
      { id: 'gone', href: '/admin/gone' as Route, childIds: [] },
    ])

    expect(items.map((item) => item.id)).toEqual(['overview'])
  })

  it('passes scoped through', () => {
    expect(renderNav([], true).scoped).toBe(true)
    expect(renderNav([], false).scoped).toBe(false)
  })
})
