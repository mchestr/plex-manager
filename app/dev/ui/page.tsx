import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { getEnv } from "@/lib/env"

import { ButtonSpecimen } from "./_sections/buttons"
import { CommandSpecimen } from "./_sections/command"
import { DataTableSpecimen } from "./_sections/composite-tables"
import { EmptyStateSpecimen, PageHeaderSpecimen, StatTileSpecimen } from "./_sections/composites"
import { AlertDialogSpecimen, ConfirmDialogSpecimen, DialogSpecimen } from "./_sections/dialogs"
import { BadgeSpecimen, CardSpecimen, IconSpecimen, StatusSpecimen } from "./_sections/display"
import { AlertSpecimen, SkeletonSpecimen, SpinnerSpecimen, StatusSpecimens } from "./_sections/feedback"
import { CheckboxSpecimen, FieldSpecimen, InputSpecimen, SelectSpecimen, SwitchSpecimen } from "./_sections/forms"
import { InkSpecimen } from "./_sections/ink"
import { DropdownMenuSpecimen, PopoverSpecimen, ToastSpecimen, TooltipSpecimen } from "./_sections/popups"
import { RewindCardSpecimen } from "./_sections/rewind-card"
import {
  LiveStatusSpecimen,
  SegmentedControlSpecimen,
  SheetSpecimen,
  SliderSpecimen,
  ToggleSpecimen,
} from "./_sections/rewind-ready"
import { IconMapSpecimen, PosterPaletteSpecimen, StatusVocabularySpecimen } from "./_sections/vocabulary"

export const metadata: Metadata = {
  title: "UI primitives",
  robots: { index: false, follow: false },
}

/**
 * The primitives sheet (ui-design-system 9.6): every `components/ui`
 * primitive in every variant and state, rendered from the real components.
 * It is the visual-regression target for `components/ui` and grows with each
 * Phase 3 step. The ink section draws them again in three Rewind inks
 * (P3.7), and the last sections hold the admin composites (P6.5). Off unless
 * `ENABLE_DEV_UI=1`.
 */
export default function DevUiPage() {
  if (getEnv().ENABLE_DEV_UI !== "1") notFound()

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 outline-none" data-testid="dev-ui">
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
      <StatusSpecimens />
      <IconSpecimen />
      <InputSpecimen />
      <FieldSpecimen />
      <CheckboxSpecimen />
      <SwitchSpecimen />
      <SelectSpecimen />
      <DialogSpecimen />
      <AlertDialogSpecimen />
      <ConfirmDialogSpecimen />
      <DropdownMenuSpecimen />
      <CommandSpecimen />
      <PopoverSpecimen />
      <TooltipSpecimen />
      <ToastSpecimen />
      <SheetSpecimen />
      <ToggleSpecimen />
      <SliderSpecimen />
      <SegmentedControlSpecimen />
      <LiveStatusSpecimen />
      <InkSpecimen />
      <StatusVocabularySpecimen />
      <IconMapSpecimen />
      <PosterPaletteSpecimen />
      <PageHeaderSpecimen />
      <StatTileSpecimen />
      <Suspense>
        <DataTableSpecimen />
      </Suspense>
      <EmptyStateSpecimen />
      <RewindCardSpecimen />
    </main>
  )
}
