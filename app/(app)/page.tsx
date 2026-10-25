import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { MemberPass } from "@/components/auth/member-pass";
import { HomePage } from "@/components/dashboard/home-page";
import { HomeSkeleton } from "@/components/dashboard/home-skeleton";
import { PublicShell } from "@/components/shell/public-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusScreen } from "@/components/ui/status-screen";
import { monogramFor, serverName as getServerName } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { icons } from "@/lib/ui/icons";
import { safeCallbackPath } from "@/lib/validations/callback-path";
import { getSession } from "@/lib/data/session";
import { getActiveService } from "@/lib/data/active-service";

interface HomeProps {
  /** `callbackUrl`: where sign-in lands afterwards, such as the admin denial's `/admin` (same-origin paths only). */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** "Home" for members, "Sign in" for the sign-in screen. */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  return { title: session?.user?.id ? "Home" : "Sign in" };
}

/**
 * `/`: the member home when signed in (the layout has already sent an
 * unfinished onboarding to `/onboarding`), else the sign-in screen. The home
 * streams behind its own skeleton; the signed-out screen never shows it.
 */
export default async function Home({ searchParams }: HomeProps) {
  const session = await getSession();
  const callbackPath = safeCallbackPath((await searchParams).callbackUrl);

  if (session?.user?.id) {
    // Signed in already (or back from Jellyfin): go where the sign-in link pointed
    if (callbackPath && callbackPath !== "/" && !callbackPath.startsWith("/?")) {
      redirect(callbackPath as Route);
    }

    return (
      <Suspense fallback={<HomeSkeleton />}>
        <HomePage userId={session.user.id} isAdmin={session.user.isAdmin} />
      </Suspense>
    );
  }

  const [plexServer, jellyfinServer, discordIntegration, serverName] = await Promise.all([
    getActiveService("plex"),
    prisma.jellyfinServer.findFirst({ where: { isActive: true, enabledForLogin: true } }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" }, select: { serverInviteCode: true } }),
    getServerName(),
  ]);

  const hasPlex = !!plexServer;
  const hasJellyfin = !!jellyfinServer;

  if (!hasPlex && !hasJellyfin) {
    const inviteCode = discordIntegration?.serverInviteCode;
    return (
      <PublicShell serverName={serverName}>
        <StatusScreen
          icon={icons.plex}
          title="Sign-in isn't set up yet"
          description="This server has no media server to sign in with. Let the server owner know."
          primaryAction={
            inviteCode ? (
              <Button
                size="lg"
                nativeButton={false}
                render={<a href={`https://discord.gg/${encodeURIComponent(inviteCode)}`} target="_blank" rel="noopener noreferrer" />}
                data-testid="sign-in-unavailable-discord"
              >
                Ask for help on Discord
                <Icon icon={icons.externalLink} />
              </Button>
            ) : (
              <Button size="lg" nativeButton={false} render={<Link href="/" />} data-testid="sign-in-unavailable-retry">
                Try again
              </Button>
            )
          }
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell serverName={serverName}>
      <MemberPass
        serverName={serverName}
        monogram={monogramFor(serverName)}
        plex={hasPlex}
        jellyfin={hasJellyfin}
        callbackUrl={callbackPath ?? undefined}
      />
    </PublicShell>
  );
}
