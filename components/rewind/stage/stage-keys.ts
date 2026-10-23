"use client"

import type { KeyboardEvent } from "react"

import { SPREAD_QUERY } from "@/lib/rewind/stage/fit-stage"
import { keyToCommand, type StageCommand } from "@/lib/rewind/stage/keymap"
import type { PlayerEvent, PlayerState } from "@/lib/rewind/stage/player-reducer"

const isSpread = () => typeof window.matchMedia === "function" && window.matchMedia(SPREAD_QUERY).matches

interface StageKeysOptions {
  state: PlayerState
  send: (event: PlayerEvent) => void
  /** The last page's index. */
  last: number
  playing: boolean
  hasTable: boolean
  /** The admin-preview frame: T always opens the table sheet. */
  framed: boolean
  /** Both previews: S opens no share sheet. */
  preview: boolean
  shortcuts: boolean
  close: () => void
  onToggleNotesTable: () => void
}

/** The stage's `onKeyDown`: the member's keymap (design 4.6) turned into player events. */
export function stageKeyDown({ state, send, last, playing, hasTable, framed, preview, shortcuts, close, onToggleNotesTable }: StageKeysOptions) {
  const run = (command: StageCommand) => {
    switch (command) {
      case "next":
        return send({ type: "NEXT", source: "key" })
      case "prev":
        return send({ type: "PREV", source: "key" })
      case "choose":
        return state.mode === "cover" ? send({ type: "CHOOSE_CUT" }) : undefined
      case "first":
        return send({ type: "GOTO", index: 0, source: "key" })
      case "last":
        return send({ type: "GOTO", index: last, source: "key" })
      case "toggle-play":
        if (state.mode === "cover" || state.mode === "ended") return
        return send({ type: playing ? "PAUSE" : "PLAY" })
      case "escape":
        return state.mode === "sheet" ? send({ type: "CLOSE_SHEET" }) : close()
      case "table":
        if (!hasTable) return
        // On the spread, T swaps the Notes for the page's table instead of opening the sheet.
        return !framed && isSpread() ? onToggleNotesTable() : send({ type: "OPEN_SHEET", sheet: "table" })
      case "share":
        return preview ? undefined : send({ type: "OPEN_SHEET", sheet: command })
      case "settings":
        return send({ type: "OPEN_SHEET", sheet: command })
    }
  }

  return (event: KeyboardEvent<HTMLElement>) => {
    const command = keyToCommand(event, { shortcuts })
    if (!command) return
    event.preventDefault()
    run(command)
  }
}
