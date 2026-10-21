import type { ReactNode } from "react"

import { RewindScope } from "@/components/rewind/stage/rewind-scope"

import { rewindFontVariables } from "@/lib/rewind/fonts"

/** Every `/rewind` page renders inside the Rewind scope (P5.1). */
export default function RewindLayout({ children }: { children: ReactNode }) {
  return <RewindScope fontClassName={rewindFontVariables}>{children}</RewindScope>
}
