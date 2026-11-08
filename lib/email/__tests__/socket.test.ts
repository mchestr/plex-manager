/**
 * @jest-environment node
 */

/**
 * Tests for lib/email/socket.ts, and for sendEmail end to end with the real
 * nodemailer against a local SMTP sink: an abort must end the SMTP session,
 * so the server never gets the message.
 */

import { EventEmitter } from "node:events"
import * as net from "node:net"

import type { EmailConfig } from "@/lib/email/env-rules"
import { abortableSocket } from "@/lib/email/socket"
import { sendEmail } from "@/lib/email/transport"

/** A stand-in for `net.connect` in one test; the rest use the real one. */
let mockConnect: ((...args: unknown[]) => unknown) | null = null
jest.mock("node:net", () => {
  const actual = jest.requireActual<typeof import("node:net")>("node:net")
  return { ...actual, connect: (...args: unknown[]) => (mockConnect ?? (actual.connect as (...args: unknown[]) => unknown))(...args) }
})
jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

interface Sink {
  server: net.Server
  port: number
  /** The messages that ended with the final dot. */
  inbox: string[]
  /** How many connections the sink got, and how many of them closed. */
  connections: { opened: number; closed: number }
  /** Holds the reply to RCPT TO until the test calls the function it is given. */
  holdRcpt: ((release: () => void) => void) | null
}

/** A minimal SMTP server: no TLS, no login, and a way to hold the RCPT TO reply. */
async function startSink(): Promise<Sink> {
  const sink: Sink = { server: net.createServer(), port: 0, inbox: [], connections: { opened: 0, closed: 0 }, holdRcpt: null }
  sink.server.on("connection", (socket) => {
    sink.connections.opened += 1
    socket.on("close", () => (sink.connections.closed += 1))
    socket.on("error", () => {})
    let buffer = ""
    let data: string[] | null = null
    const reply = (line: string) => socket.writable && socket.write(`${line}\r\n`)
    socket.setEncoding("utf8")
    socket.on("data", (chunk: string) => {
      buffer += chunk
      let end: number
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (data !== null) {
          if (line === ".") {
            sink.inbox.push(data.join("\n"))
            data = null
            reply("250 OK queued")
          } else data.push(line)
          continue
        }
        const verb = line.slice(0, 4).toUpperCase()
        if (verb === "EHLO" || verb === "HELO" || verb === "MAIL") reply("250 OK")
        else if (verb === "RCPT") (sink.holdRcpt ?? ((release) => release()))(() => reply("250 OK"))
        else if (verb === "DATA") {
          data = []
          reply("354 go on")
        } else if (verb === "QUIT") {
          reply("221 Bye")
          socket.end()
        } else reply("502 no")
      }
    })
    reply("220 sink ESMTP")
  })
  await new Promise<void>((resolve) => sink.server.listen(0, "127.0.0.1", resolve))
  sink.port = (sink.server.address() as net.AddressInfo).port
  return sink
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10))
}

type Callback = Parameters<ReturnType<typeof abortableSocket>["getSocket"]>[1]
const options = {} as Parameters<ReturnType<typeof abortableSocket>["getSocket"]>[0]

function openWith(server: { host: string; port: number }, signal: AbortSignal) {
  const opener = abortableSocket(server, signal)
  const callback = jest.fn<ReturnType<Callback>, Parameters<Callback>>()
  opener.getSocket(options, callback)
  return { opener, callback }
}

let sink: Sink

beforeEach(async () => {
  sink = await startSink()
})

afterEach(async () => {
  mockConnect = null
  await new Promise<void>((resolve) => sink.server.close(() => resolve()))
})

describe("abortableSocket", () => {
  it("hands nodemailer a connected socket, which an abort destroys", async () => {
    const controller = new AbortController()
    const { callback } = openWith({ host: "127.0.0.1", port: sink.port }, controller.signal)

    await until(() => callback.mock.calls.length > 0)
    expect(callback).toHaveBeenCalledWith(null, { connection: expect.any(net.Socket) })
    const socket = (callback.mock.calls[0][1] as { connection: net.Socket }).connection
    expect(socket.remotePort).toBe(sink.port)

    controller.abort()
    expect(socket.destroyed).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("stops listening after release, so a later abort leaves the socket alone", async () => {
    const controller = new AbortController()
    const { opener, callback } = openWith({ host: "127.0.0.1", port: sink.port }, controller.signal)
    await until(() => callback.mock.calls.length > 0)
    const socket = (callback.mock.calls[0][1] as { connection: net.Socket }).connection

    opener.release()
    controller.abort()
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it("opens nothing on a signal that already ended", async () => {
    const { callback } = openWith({ host: "127.0.0.1", port: sink.port }, AbortSignal.abort())

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "ABORT_ERR" }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sink.connections.opened).toBe(0)
  })

  it("ends a connect that is still open as ABORT_ERR when the signal ends", () => {
    const controller = new AbortController()
    const { callback } = openWith({ host: "127.0.0.1", port: sink.port }, controller.signal)

    controller.abort()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "ABORT_ERR" }))
  })

  it("passes a refused connection back to nodemailer", async () => {
    const closed = await startSink()
    const port = closed.port
    await new Promise<void>((resolve) => closed.server.close(() => resolve()))
    const { callback } = openWith({ host: "127.0.0.1", port }, new AbortController().signal)

    await until(() => callback.mock.calls.length > 0)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "ECONNREFUSED" }))
  })

  it("gives up on a connect that takes longer than 10 seconds", () => {
    const socket = Object.assign(new EventEmitter(), { setTimeout: jest.fn(), destroy: jest.fn() })
    mockConnect = () => socket
    const { callback } = openWith({ host: "smtp.example.com", port: 587 }, new AbortController().signal)

    expect(socket.setTimeout).toHaveBeenCalledWith(10_000, expect.any(Function))
    const onTimeout = socket.setTimeout.mock.calls[0][1] as () => void
    onTimeout()
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "ETIMEDOUT" }))
    expect(socket.destroy).toHaveBeenCalled()
  })
})

describe("sendEmail with the real nodemailer", () => {
  const config = (): EmailConfig => ({
    server: { host: "127.0.0.1", port: sink.port, secure: false },
    auth: null,
    from: "noreply@example.com",
    replyTo: null,
    postalAddress: null,
  })
  const message = { from: "noreply@example.com", to: "someone@example.com", subject: "Hi", text: "Hello" }

  it("delivers a message over the app's socket", async () => {
    await expect(sendEmail(config(), message)).resolves.toEqual({ ok: true, smtpCode: 250 })
    expect(sink.inbox).toHaveLength(1)
  })

  it("ends the SMTP session on an abort, so the server never gets the message", async () => {
    const controller = new AbortController()
    let release = () => {}
    sink.holdRcpt = (reply) => {
      release = reply
      controller.abort()
    }

    await expect(sendEmail(config(), message, controller.signal)).resolves.toEqual({
      ok: false,
      failure: expect.objectContaining({ kind: "timeout" }),
    })
    await until(() => sink.connections.closed === 1)
    release()
    expect(sink.connections.closed).toBe(1)
    expect(sink.inbox).toHaveLength(0)
  })
})
