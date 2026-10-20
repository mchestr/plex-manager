import { connection } from "next/server"

import { renderIcon } from "@/lib/og/brand-images"

export const runtime = "nodejs"

const SIZES = [32, 192, 512] as const

/** The favicon and the manifest's two install icons, served at `/icon/<size>`. */
export function generateImageMetadata() {
  return SIZES.map((size) => ({ id: String(size), size: { width: size, height: size }, contentType: "image/png" }))
}

export default async function Icon({ id }: { id: Promise<string> }) {
  // The monogram follows the server name, so the icon renders per request.
  await connection()
  const requested = await id
  const size = SIZES.find((s) => String(s) === requested) ?? SIZES[0]
  return renderIcon(size)
}
