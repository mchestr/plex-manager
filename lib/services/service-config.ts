/**
 * One active row per service (P10.24, DUP-05). Setup and settings save
 * through {@link saveActiveService}, so going Back in the wizard and saving
 * again, or saving a new address in settings, never leaves two active
 * configs for the runtime's `findFirst({ where: { isActive: true } })` to
 * choose between.
 *
 * @module lib/services/service-config
 */

import "server-only"

import type { PrismaTransactionClient } from "@/lib/prisma"
import { SERVICE_DESCRIPTORS, type ServiceKind, type ServiceRow, type StoredService } from "@/lib/services/descriptors"

/**
 * Makes `data` the kind's one active row, inside the caller's transaction:
 * every active row is deactivated, then the row with the same URL is updated
 * (re-saving an address keeps its row) or a new one is created, active.
 *
 * @returns The saved row.
 */
export async function saveActiveService<K extends ServiceKind>(
  kind: K,
  data: ServiceRow<K>,
  { tx }: { tx: PrismaTransactionClient }
): Promise<StoredService<K>> {
  const delegate = SERVICE_DESCRIPTORS[kind].delegate(tx)
  await delegate.updateMany({ where: { isActive: true }, data: { isActive: false } })
  const existing = await delegate.findFirst({ where: { url: data.url } })
  return existing ? delegate.update({ where: { id: existing.id }, data }) : delegate.create({ data })
}
