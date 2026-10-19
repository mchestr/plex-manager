/**
 * @jest-environment node
 */

import type * as Shutdown from "@/lib/instrumentation/shutdown"

// The one SIGTERM/SIGINT coordinator (BP-15). Each test loads a fresh copy of
// the module, whose handlers, tasks and signal are per-process state.

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}))

const originalEnv = process.env
const SIGNALS = ["SIGTERM", "SIGINT"] as const
type Listener = ReturnType<typeof process.listeners>[number]
let before: Record<string, Listener[]>
let exit: jest.SpyInstance
let shutdown: typeof Shutdown

function load(): typeof Shutdown {
  let loaded!: typeof Shutdown
  jest.isolateModules(() => {
    loaded = require("@/lib/instrumentation/shutdown")
  })
  return loaded
}

function added(signal: (typeof SIGNALS)[number]): Listener[] {
  return process.listeners(signal).filter((listener) => !before[signal].includes(listener))
}

// Jest's sandboxed `process.emit` does not reach listeners added with
// `process.on`, so call the handlers the module added directly.
function send(signal: (typeof SIGNALS)[number]): void {
  for (const listener of added(signal)) (listener as NodeJS.SignalsListener)(signal)
}

beforeEach(() => {
  jest.useFakeTimers()
  process.env = { ...originalEnv, NODE_ENV: "production" }
  delete process.env.SHUTDOWN_GRACE_MS
  before = Object.fromEntries(SIGNALS.map((signal) => [signal, process.listeners(signal)]))
  exit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never)
  shutdown = load()
})

afterEach(() => {
  for (const signal of SIGNALS) {
    for (const listener of added(signal)) process.removeListener(signal, listener as NodeJS.SignalsListener)
  }
  exit.mockRestore()
  jest.useRealTimers()
})

afterAll(() => {
  process.env = originalEnv
})

describe("installShutdownHandlers()", () => {
  it("runs drain then close, with shutdownSignal aborted before any drain task starts", async () => {
    const order: string[] = []
    shutdown.onShutdown("close-a", "close", async () => {
      order.push("close-a")
    })
    shutdown.onShutdown("drain-a", "drain", async () => {
      order.push(`drain-a aborted=${shutdown.shutdownSignal.aborted}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
      order.push("drain-a done")
    })
    shutdown.onShutdown("drain-b", "drain", async () => {
      order.push(`drain-b aborted=${shutdown.shutdownSignal.aborted}`)
    })
    shutdown.installShutdownHandlers()

    send("SIGTERM")
    await jest.advanceTimersByTimeAsync(100)

    expect(order).toEqual(["drain-a aborted=true", "drain-b aborted=true", "drain-a done", "close-a"])
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it("keeps going when a task fails", async () => {
    const close = jest.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("broken", "drain", () => Promise.reject(new Error("boom")))
    shutdown.onShutdown("close", "close", close)
    shutdown.installShutdownHandlers()

    send("SIGINT")
    await jest.advanceTimersByTimeAsync(0)

    expect(close).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it("cuts a hanging drain task off at SHUTDOWN_GRACE_MS and exits with 1 once", async () => {
    process.env.SHUTDOWN_GRACE_MS = "500"
    const close = jest.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("hangs", "drain", () => new Promise(() => {}))
    shutdown.onShutdown("close", "close", close)
    shutdown.installShutdownHandlers()

    send("SIGTERM")
    await jest.advanceTimersByTimeAsync(499)
    expect(exit).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(1)
    expect(close).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(10_000)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it("defaults the grace to 8000 ms", async () => {
    shutdown.onShutdown("hangs", "drain", () => new Promise(() => {}))
    shutdown.installShutdownHandlers()

    send("SIGTERM")
    await jest.advanceTimersByTimeAsync(7999)
    expect(exit).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it("runs nothing twice on a second signal", async () => {
    const drain = jest.fn().mockResolvedValue(undefined)
    shutdown.onShutdown("drain", "drain", drain)
    shutdown.installShutdownHandlers()

    send("SIGTERM")
    send("SIGTERM")
    send("SIGINT")
    await jest.advanceTimersByTimeAsync(0)

    expect(drain).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it("registers one handler per signal when installed twice", () => {
    shutdown.installShutdownHandlers()
    shutdown.installShutdownHandlers()

    expect(added("SIGTERM")).toHaveLength(1)
    expect(added("SIGINT")).toHaveLength(1)
  })

  it("installs nothing under NODE_ENV=test", () => {
    process.env = { ...process.env, NODE_ENV: "test" }

    shutdown.installShutdownHandlers()

    expect(added("SIGTERM")).toHaveLength(0)
    expect(added("SIGINT")).toHaveLength(0)
  })
})
