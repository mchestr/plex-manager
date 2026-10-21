"use client"

import { Download } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { useRecordShare } from "@/components/rewind/stage/use-record-view"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { pageMeta } from "@/lib/rewind/page-meta"
import { collectCards } from "@/lib/rewind/share/save-all"
import { cardEntryName, openCardZip, zipFileName } from "@/lib/rewind/share/zip"
import { cardUrl, saveAllCards } from "@/lib/rewind/share-sheet"

import { useShare } from "./share-context"

interface SaveAllProps {
  /** The button's classes: artboard scale on the back cover. */
  className?: string
  style?: CSSProperties
}

const plural = new Intl.PluralRules("en-US")

/** "Save all 15 cards", or "Save 1 card". */
const saveAllLabel = (n: number) => (plural.select(n) === "one" ? `Save ${n} card` : `Save all ${n} cards`)

function download(bytes: Uint8Array, name: string) {
  const href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }))
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

/**
 * "Save all {n} cards" (design 6.3, FR-24, P8.4): every card the member can
 * share under the current choices, fetched from the owner card route three
 * at a time and zipped in the browser as `rewind-2026-cards.zip`. A polite
 * live region counts the progress; unmounting (the sheet closing) cancels.
 * Cards that still fail leave the rest in the ZIP and a toast. A lapsed
 * member is pointed to `/subscribe` (FR-51). Each run records one `save`.
 */
export function SaveAll(props: SaveAllProps) {
  const share = useShare()
  return share?.setup.features.saveAll ? <SaveAllControl share={share} {...props} /> : null
}

function SaveAllControl({ share, className, style }: SaveAllProps & { share: NonNullable<ReturnType<typeof useShare>> }) {
  const recordShare = useRecordShare()
  const { showError, showInfo } = useToast()
  const [done, setDone] = useState<number | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const { setup, choices } = share
  const cards = saveAllCards(setup.dailyCards, choices.dailyDetail)
  if (cards.length === 0) return null

  if (!setup.canShare) {
    return (
      <p className="font-text text-ui" data-testid="rewind-save-all-membership">
        Sharing needs an active membership.{" "}
        <Link href="/subscribe" className="underline">
          See memberships
        </Link>
      </p>
    )
  }

  const run = async () => {
    const abort = new AbortController()
    controller.current = abort
    setDone(0)
    recordShare("save")
    try {
      const zip = await openCardZip()
      const requests = cards.map((card) => ({
        url: cardUrl(setup.rewindId, card, choices),
        name: cardEntryName(setup.folios[card] ?? cards.indexOf(card) + 1, pageMeta[card].name),
      }))
      const { saved, failed } = await collectCards(requests, { signal: abort.signal, onCard: zip.add, onProgress: setDone })
      const bytes = await zip.finish()
      if (saved > 0) download(bytes, zipFileName(setup.year))
      if (failed > 0) {
        if (saved > 0) showInfo(`Saved ${saved} of ${cards.length} cards. Try again for the rest.`)
        else showError("Could not save the cards. Try again.")
      }
    } catch {
      if (!abort.signal.aborted) showError("Could not save the cards. Try again.")
    } finally {
      if (controller.current === abort) controller.current = null
      setDone(null)
    }
  }

  return (
    <div className="flex flex-col">
      <Button variant="ink-outline" size="pill" className={className} style={style} disabled={done !== null} onClick={run} icon={<Icon icon={Download} />} data-testid="rewind-save-all">
        {saveAllLabel(cards.length)}
      </Button>
      <p aria-live="polite" className="sr-only" data-testid="rewind-save-all-progress">
        {done !== null ? `Saving ${Math.min(done + 1, cards.length)} of ${cards.length}` : ""}
      </p>
    </div>
  )
}
