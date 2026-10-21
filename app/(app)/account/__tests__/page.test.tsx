/**
 * The /account page (P6.11, ui-design-system 6.1): Discord, Notifications and
 * Time zone sections, with Appearance held back until P10.10.
 */

import { render, screen, within } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import AccountPage from '@/app/(app)/account/page'
import { discordHandleFor } from '@/lib/member/shell'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
jest.mock('@/lib/member/shell', () => ({ discordHandleFor: jest.fn() }))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn().mockResolvedValue('America/Chicago') }))
jest.mock('@/lib/wrapped/season', () => ({
  getSeasonState: jest.fn().mockResolvedValue({ seasonYear: 2026 }),
}))

const fieldProps: Record<string, unknown>[] = []
jest.mock('@/components/account/timezone-field', () => ({
  TimezoneField: (props: Record<string, unknown>) => {
    fieldProps.push(props)
    return <div data-testid="account-timezone" />
  },
}))
jest.mock('@/components/account/notify-switch', () => ({
  NotifySwitch: ({ notify }: { notify: boolean }) => <div data-testid="account-notify-switch" data-on={String(notify)} />,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  fieldProps.length = 0
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
  jest.mocked(discordHandleFor).mockResolvedValue(null)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', timezone: 'Europe/London' }))
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
})

describe('AccountPage', () => {
  it('redirects without a session', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(AccountPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('renders the sections, with Appearance absent', async () => {
    render(await AccountPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    for (const title of ['Discord', 'Notifications', 'Time zone']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(screen.queryByText(/Appearance/)).not.toBeInTheDocument()
    expect(fieldProps[0]).toMatchObject({ value: 'Europe/London', serverZone: 'America/Chicago' })
    expect(fieldProps[0].options).toEqual(expect.arrayContaining(['UTC', 'America/Chicago']))
  })

  it('reads the season year prefs, defaulting the switch on', async () => {
    render(await AccountPage())
    expect(prismaMock.rewindPrefs.findUnique).toHaveBeenCalledWith({
      where: { userId_year: { userId: 'member-1', year: 2026 } },
      select: { notify: true },
    })
    expect(screen.getByTestId('account-notify-switch')).toHaveAttribute('data-on', 'true')
  })

  it('shows a stored notify off', async () => {
    prismaMock.rewindPrefs.findUnique.mockResolvedValue({ notify: false } as never)

    render(await AccountPage())

    expect(screen.getByTestId('account-notify-switch')).toHaveAttribute('data-on', 'false')
  })

  it('offers Link Discord when unlinked', async () => {
    render(await AccountPage())

    const section = screen.getByTestId('account-discord')
    expect(within(section).getByTestId('account-discord-link')).toHaveTextContent('Link Discord')
    expect(within(section).getByTestId('account-discord-link')).toHaveAttribute('href', '/discord/link')
  })

  it('shows the linked handle with Manage when linked', async () => {
    jest.mocked(discordHandleFor).mockResolvedValue('morgan.lee')

    render(await AccountPage())

    const section = screen.getByTestId('account-discord')
    expect(within(section).getByText('Linked as morgan.lee')).toBeInTheDocument()
    expect(within(section).getByTestId('account-discord-link')).toHaveTextContent('Manage')
    expect(within(section).getByTestId('account-discord-link')).toHaveAttribute('href', '/discord/link')
  })

  it('leaves Discord out while linking is off', async () => {
    jest.mocked(discordHandleFor).mockResolvedValue(undefined)

    render(await AccountPage())

    expect(screen.queryByTestId('account-discord')).not.toBeInTheDocument()
  })
})
