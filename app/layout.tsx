import "@/app/globals.css";
import { plexFontClassNames } from "@/app/fonts";
import { FlashFromQuery } from "@/components/ui/flash-from-query";
import { serverName } from "@/lib/brand";
import { resolveAppearance, resolveTheme, THEME_COLOR } from "@/lib/design/theme";
import { getEnv } from "@/lib/env";
import { getFormatSettings } from "@/lib/settings/app-settings";
import { Providers } from "@/lib/providers";
import { cn } from "@/lib/utils";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

/**
 * No zoom locks: pinch-zoom and text resize stay available (WCAG 1.4.4). The
 * browser chrome takes the resolved theme's background (P10.10).
 */
export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: THEME_COLOR[await resolveTheme()],
  };
}

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
  const [format, name, appearance] = await Promise.all([getFormatSettings(), serverName(), resolveAppearance()]);

  // Light is the :root block, with no class; dark adds `.dark` (ui-design-system 4.1).
  return (
    <html lang="en" className={cn(appearance.theme === "dark" && "dark", plexFontClassNames)} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground">
        {/* Each segment layout renders the one <main id="main" tabIndex={-1}> this skips to. */}
        <a
          href="#main"
          data-testid="skip-to-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-(--z-toast) focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-ui focus:font-medium focus:text-primary-foreground focus:shadow-popover"
        >
          Skip to content
        </a>
        <Providers format={format} serverName={name} appearance={appearance}>
          {children}
          <Suspense fallback={null}>
            <FlashFromQuery />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
