import { getActiveAnnouncements } from "@/actions/announcements";
import { getPrometheusStatus } from "@/actions/prometheus-status";
import { getUserFirstWatchDate } from "@/actions/users";
import { ServiceSignInToggle } from "@/components/auth/service-sign-in-toggle";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AuthService } from "@/types/onboarding";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

export const dynamic = 'force-dynamic'

const OnboardingStatusSchema = z.object({
  plex: z.boolean(),
  jellyfin: z.boolean(),
})

interface OnboardingStatusRecord {
  plex: boolean
  jellyfin: boolean
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const [plexServer, jellyfinServer, discordIntegration, announcements, overseerr, prometheusStatus] = await Promise.all([
    prisma.plexServer.findFirst({
      where: { isActive: true },
    }),
    prisma.jellyfinServer.findFirst({
      where: { isActive: true, enabledForLogin: true },
    }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    getActiveAnnouncements(),
    prisma.overseerr.findFirst({ where: { isActive: true } }),
    getPrometheusStatus(),
  ]);

  // Determine server name based on what's configured
  const serverName = plexServer?.name || jellyfinServer?.name || "Media Server";
  const discordEnabled = Boolean(discordIntegration?.isEnabled && discordIntegration?.clientId && discordIntegration?.clientSecret);
  const overseerrUrl = overseerr?.publicUrl || overseerr?.url || null;

  // Handle redirect logic for authenticated users
  if (session?.user?.id) {
    const userPromise = prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingStatus: true,
        primaryAuthService: true,
        createdAt: true,
        plexUserId: true,
        jellyfinUserId: true,
        email: true,
      }
    });
    const discordConnectionPromise = discordEnabled
      ? prisma.discordConnection.findUnique({ where: { userId: session.user.id } })
      : Promise.resolve(null);

    const [user, discordConnection] = await Promise.all([userPromise, discordConnectionPromise]);

    // Check service-specific onboarding completion
    if (user) {
      const validation = OnboardingStatusSchema.safeParse(user.onboardingStatus)
      const status: OnboardingStatusRecord = validation.success
        ? validation.data
        : { plex: false, jellyfin: false };
      const primaryService: AuthService = (user.primaryAuthService as AuthService) || "plex";

      // Redirect to onboarding if primary service onboarding not complete
      if (!status[primaryService]) {
        redirect("/onboarding");
      }
    }

    // Get first watch date from Tautulli for accurate membership duration
    // Falls back to account creation date if Tautulli is not available or user has no history
    let memberSince = user?.createdAt?.toISOString() ?? new Date().toISOString();
    if (user?.plexUserId) {
      const firstWatchResult = await getUserFirstWatchDate(user.plexUserId, user.email);
      if (firstWatchResult.success && firstWatchResult.firstWatchDate) {
        memberSince = firstWatchResult.firstWatchDate;
      }
    }

    const discordConnectionSummary = discordConnection
      ? {
          username: discordConnection.username,
          discriminator: discordConnection.discriminator,
          globalName: discordConnection.globalName,
          linkedAt: discordConnection.linkedAt ? discordConnection.linkedAt.toISOString() : null,
          metadataSyncedAt: discordConnection.metadataSyncedAt ? discordConnection.metadataSyncedAt.toISOString() : null,
        }
      : null;

    // Determine media server URL based on primary auth service
    const mediaServerUrl = user?.primaryAuthService === "jellyfin"
      ? jellyfinServer?.url
      : plexServer?.url;

    return (
      <UserDashboard
        userId={session.user.id}
        serverName={serverName}
        isAdmin={session.user.isAdmin}
        discordEnabled={discordEnabled}
        discordConnection={discordConnectionSummary}
        serverInviteCode={discordIntegration?.serverInviteCode ?? null}
        announcements={announcements}
        overseerrUrl={overseerrUrl}
        prometheusStatus={prometheusStatus}
        memberSince={memberSince}
        primaryAuthService={user?.primaryAuthService}
        mediaServerUrl={mediaServerUrl}
      />
    );
  }

  // Unauthenticated: Show sign-in options
  const hasPlex = !!plexServer;
  const hasJellyfin = !!jellyfinServer;

  if (!hasPlex && !hasJellyfin) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4">
        <div className="flex flex-col items-center gap-6 sm:gap-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Media Server
          </h1>
          <p className="text-slate-400 text-lg">No media servers configured. Please contact your administrator.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md">
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
    </main>
  );
}

