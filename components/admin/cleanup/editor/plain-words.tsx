import type { WhyPart } from "@/lib/cleanup/engine/types"

interface PlainWordsProps {
  /** `describeRule()` of the draft and the mode: values are strong (TS 4.4 item 5). */
  parts: readonly WhyPart[]
}

/**
 * "In plain words" (UX 4.3.1, 5.8): the whole rule as one sentence, made from
 * the saved rule and the unsaved changes, with each value in `<strong>`. It
 * sits under the builder at every width, before the preview card on a phone.
 */
export function PlainWords({ parts }: PlainWordsProps) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-5" data-testid="admin-cleanup-plain-words">
      <div className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-4">
        <h2 className="text-h3 text-foreground">
          In plain words
        </h2>
        <p className="text-label text-muted-foreground">Made from the saved rule and your changes</p>
      </div>
      <p className="max-w-[72ch] text-body text-foreground/90">
        {parts.map((part, i) =>
          part.strong ? (
            <strong key={i} className="font-semibold text-foreground">
              {part.text}
            </strong>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
      </p>
    </section>
  )
}
