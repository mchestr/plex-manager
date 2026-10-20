import type { MetadataRoute } from "next"
import { connection } from "next/server"

import { serverName } from "@/lib/brand"
import { themes } from "@/lib/design/tokens"

/** The install manifest: the server's name and the monogram icons from `app/icon.tsx`. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await connection()
  const name = await serverName()
  return {
    name,
    short_name: name,
    start_url: "/",
    display: "standalone",
    theme_color: themes.dark.background.hex,
    background_color: themes.dark.background.hex,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  }
}
