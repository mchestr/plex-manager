import { buildConversationFinding } from '@/__tests__/helpers/factories'
import type { ReviewFinding } from '@/components/admin/ai-activity/review/finding-card'

/** A finding as `getConversationReview` returns it: the stored columns and the message it points at. */
export function reviewFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
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
    message: { index: 3, role: 'assistant', content: 'You have 12 libraries.' },
    ...overrides,
  }
}
