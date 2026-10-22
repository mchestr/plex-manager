import { FinishingSignIn } from "@/components/auth/finishing-sign-in"

/** The one spinner screen the app keeps (ui-design-system 6.7). */
export default function Loading() {
  return <FinishingSignIn data-testid="plex-callback-loading" />
}
