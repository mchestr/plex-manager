/**
 * A {@link LeaseStore} on Redis: one key per lease name, holding the owner.
 *
 * ```
 * acquire: SET <name> <owner> NX PX <ms>, or PEXPIRE when <owner> already holds it
 * renew:   PEXPIRE, only while the value is still <owner>
 * release: DEL, only while the value is still <owner>
 * ```
 *
 * The compare-and-renew and compare-and-delete scripts mean an owner whose
 * lease expired can never extend or release the lease a newer owner now holds.
 * Acquire is re-entrant for its owner: a BullMQ job run again after its worker
 * died (a stalled job keeps its id) takes back the lease its first run left.
 *
 * It carries the short per-member locks (P11.3, BP-19): a Rewind generation
 * (`lib/locks/generation-lock.ts`) and a grant or revoke of a member's access.
 *
 * @module
 */

import type Redis from "ioredis"

import type { LeaseClaim, LeaseName, LeaseStore } from "@/lib/locks/lease-lock"

const ACQUIRE_SCRIPT = `
local holder = redis.call('GET', KEYS[1])
if not holder then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return 1
end
if holder == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`

/** The lease's length in whole milliseconds, at least 1. */
function ttlMs({ now, expiresAt }: LeaseClaim): number {
  return Math.max(1, expiresAt.getTime() - now.getTime())
}

/** {@link LeaseStore} on Redis keys; the key is the lease name. */
export class RedisLeaseStore implements LeaseStore {
  constructor(private readonly redis: Pick<Redis, "eval">) {}

  async acquire(claim: LeaseClaim): Promise<boolean> {
    return (await this.redis.eval(ACQUIRE_SCRIPT, 1, claim.name, claim.instanceId, ttlMs(claim))) === 1
  }

  async renew(claim: LeaseClaim): Promise<boolean> {
    return (await this.redis.eval(RENEW_SCRIPT, 1, claim.name, claim.instanceId, ttlMs(claim))) === 1
  }

  async release(name: LeaseName, instanceId: string): Promise<boolean> {
    return (await this.redis.eval(RELEASE_SCRIPT, 1, name, instanceId)) === 1
  }
}
