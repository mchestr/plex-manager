"use client"

import { Download, Share } from "lucide-react"
import Link from "next/link"
import { useId, useRef, useState, type Ref } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { registry, type RewindPageType } from "@/lib/rewind/registry"
import { cardFileName, cardUrl, type CardChoices } from "@/lib/rewind/share-sheet"
import type { SharePageType } from "@/lib/wrapped/data/share-safe-schema"

import { useShare } from "./share-context"
import { ShareLink } from "./share-link"
import { useCardFile } from "./use-card-file"
import { canShareFiles, saveFile, shareFile } from "./web-share"

interface ShareSheetProps {
  open: boolean
  onClose: () => void
  /** The page the story is on; the picker starts there when it has a card. */
  page: RewindPageType
  /** Opened from the back cover's "Change": focus starts on the switches. */
  atSettings: boolean
}

interface SwitchRowProps {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  testId: string
  inputRef?: Ref<HTMLButtonElement>
}

function SwitchRow({ id, label, hint, checked, disabled, onChange, testId, inputRef }: SwitchRowProps) {
  return (
    <li className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <span id={`${id}-hint`} className="text-ui text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      <Switch
        ref={inputRef}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </li>
  )
}

/**
 * The share sheet (design 6.3, 6.5, `sheet-share.png`): a bottom sheet on
 * paper with a page picker over `eligibleCards`, the live card preview (the
 * owner card route with the current choices, so the preview is what will be
 * posted), the sign, artwork and daily-detail switches, and Share image
 * (only where the browser shares files), Save image and Copy link. The card
 * PNG is fetched into a `File` as soon as the sheet opens and after every
 * change, so Share image keeps the tap's user activation.
 */
export function ShareSheet({ open, onClose, page, atSettings }: ShareSheetProps) {
  const share = useShare()
  const id = useId()
  const signRef = useRef<HTMLButtonElement>(null)
  const [picked, setPicked] = useState<SharePageType | null>(null)
  const [lapsed, setLapsed] = useState(false)
  const [pressAndHold, setPressAndHold] = useState(false)
  const [filesShareable] = useState(canShareFiles)
  const setup = share?.setup
  const cards = setup?.cards ?? []
  const current = picked ?? (cards.find((card) => card === page) ?? cards[0] ?? null)
  const choices: CardChoices | null = share ? { ...share.choices, dailyDetail: current === "calendar" || share.choices.dailyDetail } : null
  const url = setup && current && choices && setup.canShare && open ? cardUrl(setup.rewindId, current, choices) : null
  const name = setup && current ? cardFileName(setup.year, current) : "rewind.png"
  const file = useCardFile(url, name)

  if (!share || !setup || !choices) return null
  const artOffered = current !== null && setup.allowArt && registry[current].share.art === true
  const membership = lapsed || !setup.canShare

  const onShare = async () => {
    if (!file || !url) return
    const outcome = await shareFile(file, `My Rewind ${setup.year}`)
    if (outcome === "failed") setPressAndHold(saveFile(file, url, name) === "opened")
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        // The next opening starts again from the page the story is on.
        setPicked(null)
        onClose()
      }}
    >
      <SheetContent side="bottom" grabber data-testid="rewind-share-sheet" className="font-display" initialFocus={atSettings ? signRef : undefined}>
        <SheetHeader>
          <SheetTitle>Share</SheetTitle>
          <SheetDescription>Story card, 1080 by 1920</SheetDescription>
        </SheetHeader>
        {membership ? (
          <p className="font-text text-ui" data-testid="rewind-share-membership">
            Sharing needs an active membership.{" "}
            <Link href="/subscribe" className="underline">
              See memberships
            </Link>
          </p>
        ) : (
          <>
            {cards.length > 1 && current ? (
              <div className="flex items-center justify-between gap-4">
                <Label id={`${id}-card`}>Card</Label>
                <Select items={cards.map((card) => ({ value: card, label: registry[card].name }))} value={current} onValueChange={(value) => value && setPicked(value as SharePageType)}>
                  <SelectTrigger aria-labelledby={`${id}-card`} data-testid="rewind-share-picker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card} value={card} label={registry[card].name} data-testid={`rewind-share-pick-${card}`}>
                        {registry[card].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- the preview is the card route's PNG, exactly what will be posted
              <img src={url} alt={`${registry[current!].name} card`} width={1080} height={1920} className="mx-auto h-72 w-auto rounded-md border border-border" data-testid="rewind-share-preview" />
            ) : null}
          </>
        )}
        <ul className="flex flex-col gap-4">
          <SwitchRow id={`${id}-sign`} label="Sign with my name" checked={choices.signed} onChange={(signed) => share.choose({ signed })} testId="rewind-share-sign" inputRef={signRef} />
          {artOffered ? (
            <SwitchRow id={`${id}-art`} label="Include artwork" checked={choices.includeArt} onChange={(includeArt) => share.choose({ includeArt })} testId="rewind-share-art" />
          ) : null}
          <SwitchRow
            id={`${id}-daily`}
            label="Daily detail"
            hint={current === "calendar" ? "This card shows which days you watched" : "One line per day, instead of one bar per week."}
            checked={choices.dailyDetail}
            disabled={current === "calendar"}
            onChange={(dailyDetail) => share.choose({ dailyDetail })}
            testId="rewind-share-daily"
          />
        </ul>
        {membership ? null : (
          <div className="flex flex-col gap-2">
            {filesShareable ? (
              <Button variant="ink" size="pill" disabled={!file} onClick={onShare} icon={<Icon icon={Share} />} data-testid="rewind-share-image">
                Share image
              </Button>
            ) : null}
            <Button
              variant={filesShareable ? "ink-outline" : "ink"}
              size="pill"
              disabled={!url}
              onClick={() => url && setPressAndHold(saveFile(file, url, name) === "opened")}
              icon={<Icon icon={Download} />}
              data-testid="rewind-share-save"
            >
              Save image
            </Button>
            {pressAndHold ? <p className="font-text text-ui">Press and hold to save</p> : null}
            <ShareLink onNeedsMembership={() => setLapsed(true)} />
          </div>
        )}
        {membership ? <ShareLink onNeedsMembership={() => setLapsed(true)} stopOnly /> : null}
        <p className="border-t border-border pt-4 font-text text-ui" data-testid="rewind-share-privacy">
          Cards never show other members. Server admins can view your Rewind.
        </p>
      </SheetContent>
    </Sheet>
  )
}
