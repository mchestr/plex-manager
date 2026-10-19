import { connection } from "next/server"

import { renderIcon } from "@/lib/og/brand-images"

export const runtime = "nodejs"
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

/** The home-screen icon for iOS, which rounds the corners itself. */
export default async function AppleIcon() {
  await connection()
  return renderIcon(size.width, 0)
}
