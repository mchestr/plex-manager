import { getActiveAnnouncements } from "@/actions/announcements";
import { getPrometheusStatus, type StatusData } from "@/actions/prometheus-status";
import { MemberPass } from "@/components/auth/member-pass";
import { PublicShell } from "@/components/shell/public-shell";
import { RewindCard } from "@/components/dashboard/rewind-card";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { MembershipLinkCard } from "@/components/dashboard/membership-link-card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { StatusScreen } from "@/components/ui/status-screen";
import { authOptions } from "@/lib/auth";
import { monogramFor, serverName as getServerName } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { requestRewindCardModel } from "@/lib/rewind/home-card";
import { icons } from "@/lib/ui/icons";
import { safeHref } from "@/lib/ui/markdown";
import { safeCallbackPath } from "@/lib/validations/callback-path";
import type { AuthService } from "@/types/onboarding";
import type { Metadata, Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
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

interface HomeProps {
  /** `callbackUrl`: where sign-in lands afterwards, such as the admin denial's `/admin` (same-origin paths only). */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? {} : { title: "Sign in" };
}

export default async function Home({ searchParams }: HomeProps) {
  const session = await getServerSession(authOptions);
  const callbackPath = safeCallbackPath((await searchParams).callbackUrl);
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

    // Signed in already (or back from Jellyfin): go where the sign-in link pointed
    if (callbackPath && callbackPath !== "/" && !callbackPath.startsWith("/?")) {
      redirect(callbackPath as Route);
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
