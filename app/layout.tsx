import "@/app/globals.css";
import { serverName } from "@/lib/brand";
import { getEnv } from "@/lib/env";
import { getFormatSettings } from "@/lib/settings/app-settings";
import { Providers } from "@/lib/providers";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

/** Titles read "{page} - {server name}"; the icons, manifest and OG card are file-based (`app/icon.tsx` and siblings). */
export async function generateMetadata(): Promise<Metadata> {
  const name = await serverName();
  // The OG card's absolute URL in unfurls.
  const { NEXT_PUBLIC_APP_URL, NEXTAUTH_URL } = getEnv();
  const base = NEXT_PUBLIC_APP_URL ?? NEXTAUTH_URL;
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title: { template: `%s - ${name}`, default: name },
    description: "Your Plex media manager",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page formats in the stored zone and locale, so none prerenders at
  // build time, when there is no database.
  await connection();
  const format = await getFormatSettings();

  return (
    <html lang="en" className="dark">
      <body>
        <Providers format={format}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
