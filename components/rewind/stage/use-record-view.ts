"use client"

import { createContext, useCallback, useContext, useEffect, useRef } from "react"

import type { recordRewindView } from "@/actions/rewind-views"

/** A share action as `RewindView.shareActions` counts it. */
export type ShareKind = "image" | "save" | "link"

/**
 * What the stage needs to record views: the `PlexWrapped` id and the Server
 * Action, passed down from the Server Component so client modules (and their
 * tests) never import the action module.
 */
export interface ViewTracking {
  rewindId: string
  record: typeof recordRewindView
}

/**
 * Records views of one open of the story (design 7.10, P7.14): a session key
 * from `crypto.randomUUID()` per open, held in a ref and never stored, and
 * one call the first time each page is reached. Returns the callback the
 * share sheet calls with `image`, `save` or `link`. Null tracking (preview
 * modes, the dev stage) records nothing.
 */
export function useRecordView(tracking: ViewTracking | null, index: number): (kind: ShareKind) => void {
  const sessionKey = useRef<string | null>(null)
  const reached = useRef(new Set<number>())
  const rewindId = tracking?.rewindId ?? null
  const record = tracking?.record ?? null

  const send = useCallback(
    (page: number, shareAction?: ShareKind) => {
      if (!rewindId || !record) return
      sessionKey.current ??= crypto.randomUUID()
      // A view that fails to record must never interrupt the story.
      record({ wrappedId: rewindId, sessionKey: sessionKey.current, page, ...(shareAction && { shareAction }) }).catch(() => undefined)
    },
    [rewindId, record]
  )

  useEffect(() => {
    const page = index + 1
    if (!rewindId || reached.current.has(page)) return
    reached.current.add(page)
    send(page)
  }, [rewindId, index, send])

  return useCallback((kind: ShareKind) => send(index + 1, kind), [send, index])
}

const RecordShareContext = createContext<(kind: ShareKind) => void>(() => undefined)

/** Provides the share sheet's {@link useRecordShare} callback. */
export const RecordShareProvider = RecordShareContext.Provider

/** Counts a share action on the current open's `RewindView`; a no-op outside the member stage. */
export function useRecordShare(): (kind: ShareKind) => void {
  return useContext(RecordShareContext)
}
