import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getEnv } from "@/lib/env"

import { ButtonSpecimen } from "./_sections/buttons"
import { BadgeSpecimen, CardSpecimen, IconSpecimen, StatusSpecimen } from "./_sections/display"
import { AlertSpecimen, SkeletonSpecimen, SpinnerSpecimen } from "./_sections/feedback"

export const metadata: Metadata = {
  title: "UI primitives",
  robots: { index: false, follow: false },
}

/**
 * The primitives sheet (ui-design-system 9.6): every `components/ui`
 * primitive in every variant and state, rendered from the real components.
 * It is the visual-regression target for `components/ui` and grows with each
 * Phase 3 step. Off unless `ENABLE_DEV_UI=1`.
 */
export default function DevUiPage() {
  if (getEnv().ENABLE_DEV_UI !== "1") notFound()

  return (
    <main id="main" className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10" data-testid="dev-ui">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">UI primitives</h1>
        <p className="text-ui text-muted-foreground">
          Every primitive in components/ui, in each variant and state. Tab through the page to check the focus ring.
        </p>
      </header>
      <ButtonSpecimen />
      <CardSpecimen />
      <BadgeSpecimen />
      <StatusSpecimen />
      <AlertSpecimen />
      <SpinnerSpecimen />
      <SkeletonSpecimen />
      <IconSpecimen />
    </main>
  )
}
