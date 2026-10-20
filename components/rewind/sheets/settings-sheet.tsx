"use client"

import type { Route } from "next"
import Link from "next/link"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import type { StagePrefs } from "@/lib/rewind/stage/prefs"

type SwitchPref = "autoplay" | "slowerPacing" | "shortcuts"

const ROWS: { pref: SwitchPref; label: string; hint: string; testId?: string }[] = [
  { pref: "autoplay", label: "Autoplay", hint: "Turn the page when its time is up." },
  { pref: "slowerPacing", label: "Slower pacing", hint: "Stay on each page half as long again." },
  { pref: "shortcuts", label: "Keyboard shortcuts", hint: "K pauses, S shares, T opens the table and comma opens Settings.", testId: "rewind-shortcuts-switch" },
]

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  prefs: StagePrefs
  onChange: (patch: Partial<StagePrefs>) => void
  articleHref: Route
  /** The "About the words" line, from `aboutTheWords(copyMeta)`. */
  aboutTheWords: string
}

/**
 * The story's Settings sheet (Rewind design 4.6): the per-device switches,
 * "Read as an article" and the "About the words" disclosure (8.1). It opens
 * from the Settings button, the comma key and a long press on Pause, and
 * prints on paper through the scope's portal.
 */
export function SettingsSheet({ open, onClose, prefs, onChange, articleHref, aboutTheWords }: SettingsSheetProps) {
  const id = useId()
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" grabber data-testid="rewind-settings-sheet" className="font-display">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>These settings stay on this device.</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-4">
          {ROWS.map(({ pref, label, hint, testId }) => (
            <li key={pref} className="flex items-start justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <Label htmlFor={`${id}-${pref}`}>{label}</Label>
                <span id={`${id}-${pref}-hint`} className="text-ui text-muted-foreground">
                  {hint}
                </span>
              </span>
              <Switch
                id={`${id}-${pref}`}
                aria-describedby={`${id}-${pref}-hint`}
                checked={prefs[pref]}
                onCheckedChange={(checked) => onChange({ [pref]: checked })}
                data-testid={testId}
              />
            </li>
          ))}
        </ul>
        <Button variant="ink-outline" size="pill" className="self-start" nativeButton={false} render={<Link href={articleHref} />} data-testid="rewind-settings-article">
          Read as an article
        </Button>
        <section aria-labelledby={`${id}-words`} className="flex flex-col gap-1 border-t border-border pt-4">
          <h3 id={`${id}-words`} className="text-ui font-semibold">
            About the words
          </h3>
          <p className="font-text text-ui" data-testid="rewind-about-words">
            {aboutTheWords}
          </p>
        </section>
      </SheetContent>
    </Sheet>
  )
}
