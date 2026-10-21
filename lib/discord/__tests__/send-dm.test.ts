/**
 * @jest-environment node
 *
 * sendDiscordDirectMessage (P7.14): opens the DM channel, then posts to it,
 * with the bot token and the caller's abort signal.
 */

import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from '@/lib/discord/api'
import { getDiscordBotToken } from '@/lib/discord/config'

jest.mock('@/lib/discord/config', () => ({ getDiscordBotToken: jest.fn() }))

const fetchMock = jest.fn()

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  jest.mocked(getDiscordBotToken).mockResolvedValue('bot-token')
})

describe('sendDiscordDirectMessage', () => {
  it('opens the DM channel, then posts the message, with the Bot header and the signal', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 'dm-channel' })).mockResolvedValueOnce(json(200, { id: 'message' }))
    const signal = new AbortController().signal

    await sendDiscordDirectMessage('discord-user', 'Your Rewind is ready.', signal)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [openUrl, openInit] = fetchMock.mock.calls[0]
    expect(openUrl).toBe('https://discord.com/api/users/@me/channels')
    expect(openInit).toMatchObject({ method: 'POST', signal, headers: { Authorization: 'Bot bot-token' } })
    expect(JSON.parse(openInit.body)).toEqual({ recipient_id: 'discord-user' })

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]
    expect(sendUrl).toBe('https://discord.com/api/channels/dm-channel/messages')
    expect(sendInit).toMatchObject({ method: 'POST', signal, headers: { Authorization: 'Bot bot-token' } })
    expect(JSON.parse(sendInit.body)).toMatchObject({ content: 'Your Rewind is ready.' })
  })

  it('throws the Discord error code when the DMs are closed', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 'dm-channel' })).mockResolvedValueOnce(json(403, { code: DISCORD_DMS_CLOSED, message: 'Cannot send messages to this user' }))

    const error = await sendDiscordDirectMessage('discord-user', 'hi', new AbortController().signal).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(DiscordApiError)
    expect(error).toMatchObject({ status: 403, code: DISCORD_DMS_CLOSED })
  })

  it('makes no call without a bot token', async () => {
    jest.mocked(getDiscordBotToken).mockResolvedValue(undefined)

    await expect(sendDiscordDirectMessage('discord-user', 'hi', new AbortController().signal)).rejects.toThrow('No Discord bot token')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes an aborted signal through to fetch', async () => {
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.signal?.aborted ? Promise.reject(new DOMException('Aborted', 'AbortError')) : Promise.resolve(json(200, {}))
    )

    await expect(sendDiscordDirectMessage('discord-user', 'hi', controller.signal)).rejects.toThrow('Aborted')
  })
})
