/**
 * @jest-environment node
 */

import { withReadSlot } from "../pool"

/** Lets every queued promise callback run. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

/** Tasks that run until released, counting how many run at once. */
function heldTasks() {
  const releases: Array<() => void> = []
  let running = 0
  let most = 0

  const task = <T>(value: T) =>
    jest.fn(() => {
      running += 1
      most = Math.max(most, running)
      return new Promise<T>((resolve) =>
        releases.push(() => {
          running -= 1
          resolve(value)
        })
      )
    })

  /** Releases whatever runs, a round at a time, until `done` settles. */
  const releaseUntil = async (done: Promise<unknown>) => {
    let settled = false
    const settle = () => {
      settled = true
    }
    done.then(settle, settle)
    while (!settled) {
      await flush()
      releases.splice(0).forEach((release) => release())
    }
  }

  return { task, releaseUntil, most: () => most }
}

describe("withReadSlot", () => {
  it("never runs more than 8 reads at once across two concurrent batches", async () => {
    const { task, releaseUntil, most } = heldTasks()
    const batch = (prefix: string) => Promise.all(Array.from({ length: 12 }, (_, i) => withReadSlot(task(`${prefix}${i}`))))
    const both = Promise.all([batch("a"), batch("b")])

    await releaseUntil(both)

    const [first, second] = await both
    expect(first).toEqual(Array.from({ length: 12 }, (_, i) => `a${i}`))
    expect(second).toEqual(Array.from({ length: 12 }, (_, i) => `b${i}`))
    expect(most()).toBe(8)
  })

  it("hands each result or error to its own caller and frees the slot", async () => {
    const failures = Array.from({ length: 8 }, () => withReadSlot(() => Promise.reject(new Error("read failed"))))
    const after = withReadSlot(async () => "read")

    for (const failure of failures) await expect(failure).rejects.toThrow("read failed")
    await expect(after).resolves.toBe("read")
  })

  it("never starts a queued task once its signal has aborted", async () => {
    const { task, releaseUntil } = heldTasks()
    const controller = new AbortController()
    const blockers = Promise.all(Array.from({ length: 8 }, () => withReadSlot(task("blocker"))))
    const skipped = jest.fn(async () => "started")
    const queued = Promise.all([withReadSlot(skipped, controller.signal), withReadSlot(skipped, controller.signal)])
    const later = withReadSlot(async () => "later")

    controller.abort()
    await releaseUntil(Promise.all([blockers, queued, later]))

    await expect(queued).resolves.toEqual([null, null])
    await expect(later).resolves.toBe("later")
    // Aborted before the call: never started, though a slot is free
    await expect(withReadSlot(skipped, controller.signal)).resolves.toBeNull()
    expect(skipped).not.toHaveBeenCalled()
  })
})
