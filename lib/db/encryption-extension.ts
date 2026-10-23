/**
 * The Prisma query extension that encrypts and decrypts `ENCRYPTED_FIELDS`.
 *
 * ## Overview
 *
 * Every query passes through {@link encryptionQuery}. Before it runs, secret
 * columns in its write payload are encrypted, nested ones included; after it
 * runs, secret columns in its result are decrypted, nested ones included
 * (SEC-34). Relations are walked with a map built once from
 * `Prisma.dmmf.datamodel.models`, so `invite.usages[].user.plexAuthToken` and
 * `user: { create: { plexAuthToken } }` are handled like top-level fields.
 *
 * ```
 * write args ──encryptWrite(model)──▶ query ──decryptDeep(model)──▶ result
 *   data / create / update            (DB)        rows, included relations
 *   nested create, createMany.data,
 *   connectOrCreate.create, update,
 *   updateMany.data, upsert
 * ```
 *
 * ## Fail soft (SEC-32)
 *
 * A field that does not decrypt (missing, unknown or wrong key, damaged
 * payload) becomes null, is recorded in `lib/security/unreadable-secrets.ts`,
 * and logs `crypto.decrypt_failed` once per model, field and kid. The rest of
 * the row decrypts, and the query never throws for it.
 *
 * ## Stored values
 *
 * {@link withStoredSecrets} runs a callback with the extension switched off,
 * so the re-encryption job reads and writes the stored values as they are.
 *
 * @module
 */

import { AsyncLocalStorage } from "node:async_hooks"

import { ENCRYPTED_FIELDS } from "@/lib/db/encrypted-fields"
import { Prisma } from "@/lib/generated/prisma/client"
import { encryptSecret, tryDecryptSecret } from "@/lib/security/crypto"
import { clearUnreadable, markUnreadable } from "@/lib/security/unreadable-secrets"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CRYPTO")

type Row = Record<string, unknown>

interface ModelShape {
  /** Relation field name to the related model's name. */
  relations: Map<string, string>
  scalars: Set<string>
}

/** @internal */
export function buildModelMap(models: readonly { name: string; fields: readonly { name: string; kind: string; type: string }[] }[]) {
  const map = new Map<string, ModelShape>()
  for (const model of models) {
    const relations = new Map<string, string>()
    const scalars = new Set<string>()
    for (const field of model.fields) {
      if (field.kind === "object") relations.set(field.name, field.type)
      else scalars.add(field.name)
    }
    map.set(model.name, { relations, scalars })
  }
  return map
}

let models: Map<string, ModelShape> | undefined

/** The relation map, built on first use (tests that mock the client never reach it). */
function shapeOf(model: string): ModelShape | undefined {
  models ??= buildModelMap(Prisma.dmmf.datamodel.models)
  return models.get(model)
}

const READ_SKIPPED = new Set(["count", "aggregate", "groupBy"])

const isObject = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value)

function each(value: unknown, fn: (item: Row) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) if (isObject(item)) fn(item)
  } else if (isObject(value)) {
    fn(value)
  }
}

/** Encrypts the model's secret columns in a `data`-shaped payload, then walks its nested writes. */
function encryptWrite(model: string, data: unknown): void {
  if (!isObject(data)) return
  for (const field of ENCRYPTED_FIELDS[model] ?? []) {
    const value = data[field]
    if (typeof value === "string") {
      data[field] = encryptSecret(value)
    } else if (isObject(value) && typeof value.set === "string") {
      // Update operator form, e.g. { set: "..." }
      value.set = encryptSecret(value.set)
    }
  }
  const shape = shapeOf(model)
  if (!shape) return
  for (const [relation, target] of shape.relations) {
    if (isObject(data[relation])) encryptNested(target, data[relation])
  }
}

/** A nested update is the data itself (to-one) or `{ where, data }`. */
function encryptUpdate(model: string, update: Row): void {
  const hasDataField = shapeOf(model)?.scalars.has("data") ?? false
  encryptWrite(model, !hasDataField && isObject(update.data) ? update.data : update)
}

function encryptNested(model: string, ops: Row): void {
  each(ops.create, (data) => encryptWrite(model, data))
  if (isObject(ops.createMany)) each(ops.createMany.data, (data) => encryptWrite(model, data))
  each(ops.connectOrCreate, (entry) => encryptWrite(model, entry.create))
  each(ops.update, (update) => encryptUpdate(model, update))
  each(ops.updateMany, (update) => encryptWrite(model, update.data))
  each(ops.upsert, (upsert) => {
    encryptWrite(model, upsert.create)
    if (isObject(upsert.update)) encryptUpdate(model, upsert.update)
  })
}

const loggedFailures = new Set<string>()

function decryptFields(model: string, row: Row): void {
  const id = typeof row.id === "string" ? row.id : undefined
  for (const field of ENCRYPTED_FIELDS[model] ?? []) {
    const value = row[field]
    if (typeof value !== "string") continue
    const result = tryDecryptSecret(value)
    if (result.ok) {
      row[field] = result.value
      clearUnreadable(model, field, id)
      continue
    }
    row[field] = null
    markUnreadable(model, field, id, result.kid, result.code)
    const logKey = `${model}.${field}:${result.kid ?? ""}`
    if (!loggedFailures.has(logKey)) {
      loggedFailures.add(logKey)
      logger.error("crypto.decrypt_failed", undefined, { model, field, kid: result.kid, code: result.code })
    }
  }
}

/**
 * Decrypts the model's secret columns in a result, and in every included or
 * selected relation, objects and arrays alike.
 *
 * @internal
 */
export function decryptDeep(model: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) decryptDeep(model, item)
    return
  }
  if (!isObject(value)) return
  decryptFields(model, value)
  const shape = shapeOf(model)
  if (!shape) return
  for (const [relation, target] of shape.relations) {
    if (value[relation] !== undefined && value[relation] !== null) decryptDeep(target, value[relation])
  }
}

/**
 * Encrypts the secret columns in an operation's write arguments, top-level
 * (`data`, an upsert's `create` and `update`) and nested.
 *
 * @internal
 */
export function encryptArgs(model: string, args: unknown): void {
  if (!isObject(args)) return
  each(args.data, (data) => encryptWrite(model, data))
  encryptWrite(model, args.create)
  if (isObject(args.update)) encryptWrite(model, args.update)
}

const storedValues = new AsyncLocalStorage<true>()

/**
 * Runs `fn` with encryption and decryption switched off for its queries, so it
 * sees and writes the values exactly as stored. Only the re-encryption job and
 * the boot canary use it.
 */
export function withStoredSecrets<T>(fn: () => Promise<T>): Promise<T> {
  return storedValues.run(true, fn)
}

/** The extension's `$allOperations` body. */
export async function encryptionQuery({
  model,
  operation,
  args,
  query,
}: {
  model?: string
  operation: string
  args: unknown
  query: (args: unknown) => Promise<unknown>
}): Promise<unknown> {
  if (!model || storedValues.getStore()) return query(args)
  encryptArgs(model, args)
  const result = await query(args)
  if (!READ_SKIPPED.has(operation)) decryptDeep(model, result)
  return result
}
