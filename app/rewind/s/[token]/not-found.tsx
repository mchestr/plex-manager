import { ShareNotFound } from "@/components/rewind/share/share-not-found"
import { RewindScope } from "@/components/rewind/stage/rewind-scope"
import { rewindFontVariables } from "@/lib/rewind/fonts"

/** A token that shares nothing: the branded 404 (proxy.ts sends the status). */
export default function SharedRewindNotFound() {
  return (
    <RewindScope fontClassName={rewindFontVariables}>
      <ShareNotFound />
    </RewindScope>
  )
}
