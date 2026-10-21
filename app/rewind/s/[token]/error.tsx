"use client"

import { ShareUnavailable } from "@/components/rewind/share/share-unavailable"
import { RewindScope } from "@/components/rewind/stage/rewind-scope"
import { rewindFontVariables } from "@/lib/rewind/fonts"

/** A share page whose render threw: the proxy's 503 copy, with Try again (design 6.6). */
export default function SharedRewindError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RewindScope fontClassName={rewindFontVariables}>
      <ShareUnavailable onRetry={reset} />
    </RewindScope>
  )
}
