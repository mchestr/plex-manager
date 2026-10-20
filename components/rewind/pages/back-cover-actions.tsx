"use client"

import { Share } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { ContentsSheet } from "@/components/rewind/sheets/contents-sheet"
import { useShare } from "@/components/rewind/share/share-context"
import { usePlayerSend, useStageSheet } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { privacyStatus, SHARE_SETTINGS_SHEET } from "@/lib/rewind/share-sheet"

interface BackCoverActionsProps {
  pages: ReadonlyArray<{ folio: number; name: string }>
  returnTo: Route
}

const footerLink = "h-11 px-0 font-semibold decoration-current decoration-[1.5px]"

/** "Share the poster" and the privacy status line, read from the member's share choices, with "Change". */
export function BackCoverShare() {
  const send = usePlayerSend()
  const state = useShare()
  const share = () => send({ type: "OPEN_SHEET", sheet: "share" })
  const change = () => send({ type: "OPEN_SHEET", sheet: SHARE_SETTINGS_SHEET })
  const status = privacyStatus({ link: Boolean(state?.link), signed: state?.choices.signed ?? false, includeArt: state?.choices.includeArt ?? false })
  return (
    <div data-rw-interactive className="flex flex-col gap-2.5 font-display">
      <Button variant="ink" size="pill" className="w-full" aria-haspopup="dialog" data-testid="rewind-back-cover-share" onClick={share} icon={<Icon icon={Share} />}>
        Share the poster
      </Button>
      <p className="flex items-baseline justify-between gap-3 text-ui" data-testid="rewind-privacy-status">
        <span>{status}</span>
        <Button variant="link" className={footerLink} aria-haspopup="dialog" data-testid="rewind-privacy-change" onClick={change}>
          Change
        </Button>
      </p>
    </div>
  )
}

/**
 * The back cover's footer (design 4.3 page 18, 4.4): "Read again" restarts
 * at page 02, "Contents" lists every page with its folio, and "Done" returns
 * where the member came from.
 */
export function BackCoverFooter({ pages, returnTo }: BackCoverActionsProps) {
  const send = usePlayerSend()
  const contents = useStageSheet("contents")
  return (
    <nav aria-label="Finish" data-rw-interactive className="flex items-center justify-between border-t-[1.5px] border-current font-display">
      <Button variant="link" className={footerLink} data-testid="rewind-read-again" onClick={() => send({ type: "READ_AGAIN" })}>
        Read again
      </Button>
      <Button variant="link" className={footerLink} aria-haspopup="dialog" data-testid="rewind-contents" onClick={contents.show}>
        Contents
      </Button>
      <Button variant="link" className={footerLink} nativeButton={false} render={<Link href={returnTo} />} data-testid="rewind-done">
        Done
      </Button>
      <ContentsSheet
        open={contents.open}
        onClose={contents.close}
        pages={pages}
        onGoTo={(index) => {
          contents.close()
          send({ type: "GOTO", index, source: "button" })
        }}
      />
    </nav>
  )
}
