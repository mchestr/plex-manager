import { MOCK_JELLYFIN_USERS } from '../mocks/jellyfin-server';

const [jellyfinOnly, both] = MOCK_JELLYFIN_USERS;

/**
 * The seeded Jellyfin members (P11.10), whose Jellyfin accounts live on the
 * mock server (`e2e/mocks/jellyfin-server.ts`): `jf-member` has only a
 * Jellyfin account, `both-member` has Plex and Jellyfin and joined with Plex.
 * Both have finished onboarding for their own service.
 */
export const JELLYFIN_MEMBERS = [
  {
    id: 'jf-member',
    name: jellyfinOnly.name,
    email: null,
    plexUserId: null,
    jellyfinUserId: jellyfinOnly.id,
    isAdmin: false,
    primaryAuthService: 'jellyfin' as const,
    onboardingStatus: { plex: false, jellyfin: true },
  },
  {
    id: 'both-member',
    name: both.name,
    email: 'both-member@example.com',
    plexUserId: 'both-member-plex-id',
    jellyfinUserId: both.id,
    isAdmin: false,
    primaryAuthService: 'plex' as const,
    onboardingStatus: { plex: true, jellyfin: false },
  },
];
