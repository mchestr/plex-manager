/**
 * The unsubscribe page: a good token shows the question and changes
 * nothing on load, with no database read; a bad token shows the dead-link
 * screen.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import UnsubscribePage, { metadata } from '@/app/email/unsubscribe/page'
import { serverName } from '@/lib/brand'
import { signUnsubscribeToken } from '@/lib/security/unsubscribe-token'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/brand', () => ({ serverName: jest.fn() }))

const formProps: Record<string, unknown>[] = []
jest.mock('@/components/email/unsubscribe-form', () => ({
  UnsubscribeForm: (props: Record<string, unknown>) => {
    formProps.push(props)
    return <div data-testid="unsubscribe-form" />
  },
  UnsubscribeDeadLink: ({ serverName }: { serverName: string }) => <div data-testid="unsubscribe-dead-link">{serverName}</div>,
}))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  formProps.length = 0
  jest.mocked(serverName).mockResolvedValue('Northfield Plex')
})

const props = (query: Record<string, string | string[]>) => ({ searchParams: Promise.resolve(query) })

describe('/email/unsubscribe', () => {
  it('keeps the page out of search results and its URL out of a Referer', () => {
    expect(metadata).toMatchObject({ robots: { index: false, follow: false }, referrer: 'no-referrer' })
  })

  it('shows the form for a good token, and reads and changes nothing on load', async () => {
    const token = signUnsubscribeToken('member-1')

    render(await UnsubscribePage(props({ token })))

    expect(screen.getByTestId('unsubscribe-form')).toBeInTheDocument()
    expect(formProps[0]).toEqual({ token, serverName: 'Northfield Plex' })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['no token', {}],
    ['two tokens', { token: ['a', 'b'] }],
    ['a changed token', { token: `${signUnsubscribeToken('member-1')}x` }],
  ])('shows the dead-link screen for %s', async (_case, query) => {
    render(await UnsubscribePage(props(query)))

    expect(screen.getByTestId('unsubscribe-dead-link')).toHaveTextContent('Northfield Plex')
    expect(formProps).toHaveLength(0)
  })
})
