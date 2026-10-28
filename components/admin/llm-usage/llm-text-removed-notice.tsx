import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const LLM_TEXT_REMOVED_NOTICE = "The October 2026 privacy clean-up removed this text."

/** Stands in for LLM prompt or response text that the October 2026 clean-up removed (P0.20). */
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
