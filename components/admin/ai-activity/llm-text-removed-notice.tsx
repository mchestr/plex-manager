import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const LLM_TEXT_REMOVED_NOTICE = "For privacy, this text isn't kept."

/**
 * Stands in for LLM prompt or response text the app doesn't have: Rewind
 * calls never store it, the retention sweep and a member's erase clear it,
 * and the October 2026 clean-up removed older rows' (P0.20).
 */
export function LlmTextRemovedNotice({ title }: { title: string }) {
  return (
    <Card data-testid="llm-text-removed-notice" className="mb-6">
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{LLM_TEXT_REMOVED_NOTICE}</p>
      </CardContent>
    </Card>
  )
}
