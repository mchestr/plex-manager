/** Thrown by {@link withTimeout} when the promise has not settled in time. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms} ms`)
    this.name = "TimeoutError"
  }
}

/**
 * Rejects with a {@link TimeoutError} when `promise` has not settled within
 * `ms`. The promise itself keeps running: this bounds the wait, not the work.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
