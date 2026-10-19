/**
 * An in-memory stand-in for the two commands the batch cache uses.
 */

import type { BatchCacheRedis } from "@/lib/wrapped/aggregate/batch-cache"

export interface FakeRedis extends BatchCacheRedis {
  store: Map<string, { value: Buffer; ttlSeconds: number }>
}

export function fakeRedis(): FakeRedis {
  const store = new Map<string, { value: Buffer; ttlSeconds: number }>()
  const redis = {
    store,
    getBuffer: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    set: jest.fn(async (key: string, value: Buffer, _mode: "EX", ttlSeconds: number) => {
      store.set(key, { value, ttlSeconds })
      return "OK"
    }),
  }
  return redis as unknown as FakeRedis
}
