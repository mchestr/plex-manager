import "@/app/globals.css";
import { OnboardingGuard } from "@/components/onboarding/onboarding-guard";
import { SetupGuard } from "@/components/setup/setup-guard";
import { Providers } from "@/lib/providers";
import type { Metadata, Viewport } from "next";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SetupGuard>
            <OnboardingGuard>
              {children}
            </OnboardingGuard>
          </SetupGuard>
        </Providers>
      </body>
    </html>
  );
}
