import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { Suspense } from "react";

import { ServiceSignInToggle } from "@/components/auth/service-sign-in-toggle";
import { HomePage } from "@/components/dashboard/home-page";
import { HomeSkeleton } from "@/components/dashboard/home-skeleton";
import { PublicShell } from "@/components/shell/public-shell";
import { authOptions } from "@/lib/auth";
import { serverName as getServerName } from "@/lib/brand";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'

/** "Home" for members; the sign-in screen keeps the root title. */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? { title: "Home" } : {};
}

/**
 * `/`: the member home when signed in (the layout has already sent an
 * unfinished onboarding to `/onboarding`), else the sign-in screen. The home
 * streams behind its own skeleton; the signed-out screen never shows it.
 */
export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    return (
      <Suspense fallback={<HomeSkeleton />}>
        <HomePage userId={session.user.id} isAdmin={session.user.isAdmin} />
      </Suspense>
    );
  }

  const [plexServer, jellyfinServer, serverName] = await Promise.all([
    prisma.plexServer.findFirst({ where: { isActive: true } }),
    prisma.jellyfinServer.findFirst({ where: { isActive: true, enabledForLogin: true } }),
    getServerName(),
  ]);

  // Unauthenticated: Show sign-in options
  const hasPlex = !!plexServer;
  const hasJellyfin = !!jellyfinServer;

  if (!hasPlex && !hasJellyfin) {
    return (
      <PublicShell serverName={serverName}>
        <div className="flex flex-col items-center gap-6 sm:gap-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Media Server
          </h1>
          <p className="text-slate-400 text-lg">No media servers configured. Please contact your administrator.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell serverName={serverName}>
      <div className="flex flex-col items-center gap-6 sm:gap-8 w-full">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent text-center">
          {serverName}
        </h1>

        <ServiceSignInToggle
          hasPlex={hasPlex}
          hasJellyfin={hasJellyfin}
          plexServerName={plexServer?.name}
          jellyfinServerName={jellyfinServer?.name}
        />
      </div>
    </PublicShell>
  );
}

