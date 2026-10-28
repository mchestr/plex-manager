/**
 * Stored secrets this process could not decrypt (P11.1, SEC-32).
 *
 * The Prisma extension turns a field it cannot decrypt into null and records
 * it here, so the settings page can ask for that secret again ("enter it
 * again"). The record is in memory, per process: it fills as rows are read,
 * and a row that decrypts again (after a re-entry or the right key) clears
 * itself.
 *
 * Nothing here holds a value, only model, field, row id, kid and code.
 *
 * @module lib/security/unreadable-secrets
 */

import type { DecryptFailureCode } from "@/lib/security/crypto"

/** @internal */
export interface UnreadableField {
  model: string
  field: string
  kid: string | null
  code: DecryptFailureCode
  /** Rows of this model and field that failed. */
  rows: number
}

const ANY_ROW = "*"

type Failures = Map<string, Map<string, { kid: string | null; code: DecryptFailureCode }>>

/** `Model.field` to row id to its failure; on `globalThis` so every server bundle shares it. */
const store = globalThis as unknown as { __pmUnreadableSecrets?: Failures }
const unreadable: Failures = (store.__pmUnreadableSecrets ??= new Map())

const keyOf = (model: string, field: string) => `${model}.${field}`

/** Records a field that did not decrypt; `id` is the row's id when it was selected. */
export function markUnreadable(model: string, field: string, id: string | undefined, kid: string | null, code: DecryptFailureCode): void {
  const key = keyOf(model, field)
  const rows = unreadable.get(key) ?? new Map()
  rows.set(id ?? ANY_ROW, { kid, code })
  unreadable.set(key, rows)
}

/** Forgets a row's failure once its field decrypts (or is rewritten). */
export function clearUnreadable(model: string, field: string, id: string | undefined): void {
  const rows = unreadable.get(keyOf(model, field))
  if (!rows) return
  rows.delete(id ?? ANY_ROW)
  if (rows.size === 0) unreadable.delete(keyOf(model, field))
}

/** True when this row's field (or the field on a row read without its id) failed to decrypt. */
export function isUnreadable(model: string, field: string, id: string | undefined): boolean {
  const rows = unreadable.get(keyOf(model, field))
  if (!rows) return false
  return rows.has(id ?? ANY_ROW)
}

/** @internal Every unreadable field, for tests. */
export function listUnreadable(): UnreadableField[] {
  return [...unreadable.entries()].map(([key, rows]) => {
    const [model, field] = key.split(".")
    const [first] = rows.values()
    // A read without the row id ("*") is the same rows seen again, unless it is all there is
    const counted = [...rows.keys()].filter((id) => id !== ANY_ROW).length
    return { model, field, kid: first.kid, code: first.code, rows: Math.max(counted, 1) }
  })
}

/** @internal Test-only reset. */
export function resetUnreadable(): void {
  unreadable.clear()
}
