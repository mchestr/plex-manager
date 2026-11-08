/**
 * The TCP connection of one send, opened by the app so that an abort can end
 * the SMTP session.
 *
 * nodemailer opens its own socket inside `sendMail()` and gives the caller no
 * way to close it: `transport.close()` leaves an open session running, so a
 * send that the caller gave up on could still deliver the email later. The
 * transport therefore opens the socket here and hands it to nodemailer
 * through the `getSocket` hook. When the signal ends, the socket is
 * destroyed, and the server never gets the end of the message.
 *
 * nodemailer still does the TLS: it wraps this socket for `smtps://` and for
 * STARTTLS, checks the certificate against the host, and destroying the
 * plain socket under it ends the TLS session too.
 *
 * @module lib/email/socket
 */

import "server-only"

import { connect } from "node:net"

import type { SMTPTransportOptions } from "nodemailer"

/** The longest the DNS lookup and the TCP connect may take together. */
const CONNECT_LIMIT_MS = 10_000

type GetSocket = NonNullable<SMTPTransportOptions["getSocket"]>

/** The error of a send that the signal ended. nodemailer's own time limits use `ETIMEDOUT`. */
export function abortError(): Error {
  return Object.assign(new Error("send aborted"), { code: "ABORT_ERR" })
}

/**
 * A `getSocket` hook that connects to `server` and destroys the socket when
 * `signal` ends, and `release`, which stops listening to the signal once the
 * send is over.
 */
export function abortableSocket(server: { host: string; port: number }, signal: AbortSignal): { getSocket: GetSocket; release: () => void } {
  let destroy = () => {}
  const onAbort = () => destroy()
  signal.addEventListener("abort", onAbort, { once: true })

  const getSocket: GetSocket = (_options, callback) => {
    if (signal.aborted) return callback(abortError())
    const socket = connect({ host: server.host, port: server.port })
    let settled = false
    const settle = (error: Error | null) => {
      if (settled) return
      settled = true
      socket.setTimeout(0)
      socket.removeListener("error", settle)
      if (error) {
        socket.destroy()
        callback(error)
      } else {
        callback(null, { connection: socket })
      }
    }
    destroy = () => {
      socket.destroy()
      settle(abortError())
    }
    socket.setTimeout(CONNECT_LIMIT_MS, () => settle(Object.assign(new Error("connection timeout"), { code: "ETIMEDOUT" })))
    socket.once("error", settle)
    socket.once("connect", () => settle(null))
  }

  return { getSocket, release: () => signal.removeEventListener("abort", onAbort) }
}
