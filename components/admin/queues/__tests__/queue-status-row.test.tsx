import { render, screen } from "@testing-library/react"

import { QueueStatusRow, queueStatusItems } from "@/components/admin/queues/queue-status-row"

const words = (state: Parameters<typeof queueStatusItems>[0]) => queueStatusItems(state).map((item) => item.status.label)

describe("queueStatusItems", () => {
  it.each([
    [true, true, false, ["Worker running", "Redis connected", "Queue running"]],
    [true, true, true, ["Worker running", "Redis connected", "Queue paused"]],
    [true, false, false, ["Worker stopped", "Redis connected", "Queue running"]],
    [true, false, true, ["Worker stopped", "Redis connected", "Queue paused"]],
    [false, false, null, ["Worker stopped", "Redis unreachable", "Queue state unknown"]],
    [false, true, null, ["Worker stopped", "Redis unreachable", "Queue state unknown"]],
    [false, true, false, ["Worker stopped", "Redis unreachable", "Queue state unknown"]],
  ] as const)("redis %p, worker %p, paused %p", (redisConnected, workerRunning, paused, expected) => {
    expect(words({ redisConnected, workerRunning, paused })).toEqual(expected)
  })

  it("never reads as running or processing when the worker is stopped", () => {
    for (const redisConnected of [true, false]) {
      for (const paused of [true, false, null]) {
        const labels = words({ redisConnected, workerRunning: false, paused }).join(" ")
        expect(labels).not.toMatch(/Worker running|Processing/)
      }
    }
  })

  it("gives a stopped worker and unreachable Redis the destructive tone", () => {
    const [worker, redis] = queueStatusItems({ redisConnected: false, workerRunning: false, paused: null })
    expect(worker.status.tone).toBe("destructive")
    expect(redis.status.tone).toBe("destructive")
  })
})

describe("QueueStatusRow", () => {
  it("renders the three words as a wrapping list", () => {
    render(<QueueStatusRow redisConnected workerRunning={false} paused={false} />)
    const row = screen.getByRole("list", { name: "Queue status" })
    expect(row).toHaveClass("flex-wrap")
    expect(screen.getByTestId("queue-status-worker")).toHaveTextContent("Worker stopped")
    expect(screen.getByTestId("queue-status-redis")).toHaveTextContent("Redis connected")
    expect(screen.getByTestId("queue-status-queue")).toHaveTextContent("Queue running")
  })
})
