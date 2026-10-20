import { connection } from "next/server"

import { OG_SIZE, renderOgCard } from "@/lib/og/brand-images"

export const runtime = "nodejs"
export const alt = "The server's monogram and name"
export const size = OG_SIZE
export const contentType = "image/png"

/** The default unfurl card for every page that sets no image of its own. */
export default async function OpenGraphImage() {
  await connection()
  return renderOgCard()
}
