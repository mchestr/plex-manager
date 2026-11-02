import { buildConversationFinding } from '@/__tests__/helpers/factories'
import type { FindingRow } from '@/lib/data/conversation-findings'

/** A finding as `listFindings` returns it: the stored columns of a {@link FindingRow}, nothing else. */
export function findingRow(overrides: Partial<FindingRow> = {}): FindingRow {
  const row = buildConversationFinding({ evidenceCheck: 'verified' })
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    type: row.type,
    severity: row.severity,
    claim: row.claim,
    evidence: row.evidence,
    suggestion: row.suggestion,
    tool: row.tool,
    evidenceSource: row.evidenceSource,
    evidenceCheck: row.evidenceCheck,
    status: row.status,
    note: row.note,
    seenCount: row.seenCount,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    triagedAt: row.triagedAt,
    ...overrides,
  }
}
