"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import type { disableRewindShare, enableRewindShare, rotateRewindShare, saveRewindSharePrefs } from "@/actions/rewind-sharing"
import type { CardChoices, ShareSetup } from "@/lib/rewind/share-sheet"

/**
 * The Server Actions the sheet calls, passed down from the Server Component
 * that renders the issue, so client modules (and their tests) never import
 * the action module itself.
 */
export interface ShareActions {
  enable: typeof enableRewindShare
  rotate: typeof rotateRewindShare
  disable: typeof disableRewindShare
  savePrefs: typeof saveRewindSharePrefs
}

interface ShareState {
  setup: ShareSetup
  actions: ShareActions
  choices: CardChoices
  /** Changes the choices and saves them to `RewindPrefs`. */
  choose: (patch: Partial<CardChoices>) => void
  link: ShareSetup["link"]
  /** The link's URL, known only in the session that created or rotated it. */
  url: string | null
  setLink: (link: ShareSetup["link"], url: string | null) => void
}

const ShareContext = createContext<ShareState | null>(null)

/**
 * The share sheet's state for one issue (design 6.3): the member's choices,
 * saved per member and year as they change, and the live link. The back
 * cover's privacy line reads it too.
 */
export function ShareProvider({ setup, actions, children }: { setup: ShareSetup; actions: ShareActions; children: ReactNode }) {
  const [choices, setChoices] = useState(setup.choices)
  const [link, setLinkState] = useState(setup.link)
  const [url, setUrl] = useState<string | null>(null)

  const choose = useCallback(
    (patch: Partial<CardChoices>) => {
      const next = { ...choices, ...patch }
      setChoices(next)
      void actions.savePrefs({ year: setup.year, ...next })
    },
    [actions, choices, setup.year]
  )
  const setLink = useCallback((next: ShareSetup["link"], nextUrl: string | null) => {
    setLinkState(next)
    setUrl(nextUrl)
  }, [])

  const value = useMemo(() => ({ setup, actions, choices, choose, link, url, setLink }), [setup, actions, choices, choose, link, url, setLink])
  return <ShareContext.Provider value={value}>{children}</ShareContext.Provider>
}

/** The issue's share state, or null outside a `ShareProvider` (the dev stage). */
export function useShare(): ShareState | null {
  return useContext(ShareContext)
}
