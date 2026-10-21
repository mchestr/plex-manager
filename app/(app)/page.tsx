import { getActiveAnnouncements } from "@/actions/announcements";
import { getPrometheusStatus, type StatusData } from "@/actions/prometheus-status";
import { ServiceSignInToggle } from "@/components/auth/service-sign-in-toggle";
import { PublicShell } from "@/components/shell/public-shell";
import { RewindCard } from "@/components/dashboard/rewind-card";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { MembershipLinkCard } from "@/components/dashboard/membership-link-card";
import { authOptions } from "@/lib/auth";
import { serverName as getServerName } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { requestRewindCardModel } from "@/lib/rewind/home-card";
import { safeHref } from "@/lib/ui/markdown";
import type { AuthService } from "@/types/onboarding";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

export const dynamic = 'force-dynamic'

const OnboardingStatusSchema = z.object({
  plex: z.boolean(),
  jellyfin: z.boolean(),
})

const UNKNOWN_STATUS: StatusData = { isConfigured: false, serviceName: "", segments: [], overallStatus: "unknown" }

interface OnboardingStatusRecord {
  plex: boolean
  jellyfin: boolean
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const [plexServer, jellyfinServer, discordIntegration, announcementsResult, overseerr, prometheusResult, config, serverName] = await Promise.all([
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
    prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } }),
    getServerName(),
  ]);

  const announcements = announcementsResult.success ? announcementsResult.data : []
  const prometheusStatus = prometheusResult.success ? prometheusResult.data : UNKNOWN_STATUS

  const discordEnabled = Boolean(discordIntegration?.isEnabled && discordIntegration?.clientId && discordIntegration?.clientSecret);
  // Members get public URLs only (the internal ones are often LAN or Docker
  // addresses), and an admin-set one renders only when it is http or https (SEC-57).
  const overseerrUrl = safeHref(overseerr?.publicUrl);

  // Handle redirect logic for authenticated users
  if (session?.user?.id) {
    const userPromise = prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingStatus: true,
        primaryAuthService: true,
      }
    });
    const discordConnectionPromise = discordEnabled
      ? prisma.discordConnection.findUnique({ where: { userId: session.user.id } })
      : Promise.resolve(null);
    const subscriptionPromise = config?.stripeEnabled
      ? prisma.subscription.findUnique({ where: { userId: session.user.id }, select: { id: true } })
      : Promise.resolve(null);

    const [user, discordConnection, subscription] = await Promise.all([userPromise, discordConnectionPromise, subscriptionPromise]);

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

    // The RewindCard resolves on the server (P6.9); the layout's nav read the same model
    const rewindCard = await requestRewindCardModel(session.user.id, session.user.isAdmin);
    const now = new Date();

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
      ? jellyfinServer?.publicUrl ?? null
      : plexServer?.publicUrl ?? null;

    return (
      <UserDashboard
        serverName={serverName}
        discordEnabled={discordEnabled}
        discordConnection={discordConnectionSummary}
        serverInviteCode={discordIntegration?.serverInviteCode ?? null}
        announcements={announcements}
        overseerrUrl={overseerrUrl}
        prometheusStatus={prometheusStatus}
        renderedAt={now.toISOString()}
        primaryAuthService={user?.primaryAuthService}
        mediaServerUrl={mediaServerUrl}
        subscriptionSlot={subscription ? <MembershipLinkCard /> : null}
        rewindSlot={rewindCard && <RewindCard {...rewindCard} />}
      />
    );
  }

  // Unauthenticated: Show sign-in options
  const hasPlex = !!plexServer;
  const hasJellyfin = !!jellyfinServer;

  if (!hasPlex && !hasJellyfin) {
    return (
      <PublicShell serverName={serverName}>
        <div className="flex flex-col items-center gap-6 sm:gap-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground">
            Media Server
          </h1>
          <p className="text-muted-foreground text-lg">No media servers configured. Please contact your administrator.</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell serverName={serverName}>
      <div className="flex flex-col items-center gap-6 sm:gap-8 w-full">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground text-center">
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

