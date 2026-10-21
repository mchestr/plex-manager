import { headers } from "next/headers"
import type { ReactNode } from "react"

import { RewindScope } from "@/components/rewind/stage/rewind-scope"

import { rewindFontVariables } from "@/lib/rewind/fonts"
import { saveDataRequested } from "@/lib/rewind/stage/low-end"

/**
 * Every `/rewind` page renders inside the Rewind scope (P5.1). A request
 * with `Save-Data: on` starts in low-end mode (P7.15).
 */
export default async function RewindLayout({ children }: { children: ReactNode }) {
  const saveData = saveDataRequested((await headers()).get("save-data"))
  return (
    <RewindScope fontClassName={rewindFontVariables} saveData={saveData}>
      {children}
    </RewindScope>
  )
}
