/**
 * An in-memory `ConversationReview` table behind {@link prismaMock}, for the
 * review job and stuck-review tests: `updateMany` applies its conditional
 * where and data the way Postgres would, so a run start, a fenced write, a
 * re-queue and a reap all see each other's effects.
 *
 * It understands the filters those writes use: equality, `null`, `{ in }`
 * and `{ lt }`, and the data `{ increment }`. `findMany` and `findFirst`
 * filter the same way; `findFirst` orders by one `desc` key.
 */

import type { ConversationReview } from '@/lib/generated/prisma/client'

import { buildConversationReview } from './factories'
import { prismaMock } from './prisma-mock'

type Row = ConversationReview
type Where = Record<string, unknown>
type Data = Record<string, unknown>

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime()
  if (typeof condition === 'object') {
    const filter = condition as { in?: unknown[]; lt?: Date }
    if (filter.in) return filter.in.includes(value)
    if (filter.lt) return value instanceof Date && value.getTime() < filter.lt.getTime()
  }
  return value === condition
}

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) => matchesField(row[key as keyof Row], condition))
}

function apply(row: Row, data: Data): void {
  for (const [key, value] of Object.entries(data)) {
    const current = row[key as keyof Row]
    const next =
      value !== null && typeof value === 'object' && 'increment' in value
        ? (current as number) + (value as { increment: number }).increment
        : value
    Object.assign(row, { [key]: next })
  }
}

function pick(row: Row, select?: Record<string, boolean>): Partial<Row> {
  if (!select) return { ...row }
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key as keyof Row]])) as Partial<Row>
}

/** Backs `prismaMock.conversationReview` with `rows`, and returns the table. */
export function useReviewTable(seed: Array<Partial<Row>> = []): Map<string, Row> {
  const rows = new Map<string, Row>()
  for (const overrides of seed) {
    const row = buildConversationReview(overrides)
    rows.set(row.id, row)
  }
  const delegate = prismaMock.conversationReview
  delegate.updateMany.mockImplementation((async (args: { where: Where; data: Data }) => {
    const hit = [...rows.values()].filter((row) => matches(row, args.where))
    for (const row of hit) apply(row, args.data)
    return { count: hit.length }
  }) as never)
  delegate.findUnique.mockImplementation((async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
    const row = rows.get(args.where.id)
    return row ? pick(row, args.select) : null
  }) as never)
  delegate.findMany.mockImplementation((async (args: { where?: Where; select?: Record<string, boolean> } = {}) =>
    [...rows.values()].filter((row) => matches(row, args.where)).map((row) => pick(row, args.select))) as never)
  delegate.findFirst.mockImplementation((async (args: { where?: Where; orderBy?: Record<string, 'desc'>; select?: Record<string, boolean> } = {}) => {
    const [key] = Object.keys(args.orderBy ?? {}) as Array<keyof Row>
    const time = (row: Row) => (key ? ((row[key] as Date | null)?.getTime() ?? -Infinity) : 0)
    const [first] = [...rows.values()].filter((row) => matches(row, args.where)).sort((a, b) => time(b) - time(a))
    return first ? pick(first, args.select) : null
  }) as never)
  return rows
}
