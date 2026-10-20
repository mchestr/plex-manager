"use client"

import dynamic from "next/dynamic"

import { NearPage } from "@/components/rewind/stage/stage-page"

const AnswerIsland = dynamic(() => import("./answer-island"))

/** Loads the island's chunk only once its page is within one turn. */
export function GuessIsland() {
  return (
    <NearPage>
      <AnswerIsland />
    </NearPage>
  )
}
