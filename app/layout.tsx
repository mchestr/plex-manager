import "@/app/globals.css";
import { getAppSettings } from "@/lib/settings/app-settings";
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

export const metadata: Metadata = {
  title: "Plex Manager",
  description: "Your Plex media manager",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page formats in the stored zone and locale, so none prerenders at
  // build time, when there is no database.
  await connection();
  const format = await getAppSettings();

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
