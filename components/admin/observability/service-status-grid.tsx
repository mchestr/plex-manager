import Link from "next/link"
import type { ServiceStatus } from "@/actions/admin"
import { PlexIcon, TautulliIcon, RadarrIcon, SonarrIcon } from "@/components/ui/service-icons"

interface ServiceStatusGridProps {
  services: {
    plex: ServiceStatus
    tautulli: ServiceStatus
    overseerr: ServiceStatus
    sonarr: ServiceStatus
    radarr: ServiceStatus
    discord: ServiceStatus
    llm: ServiceStatus
  }
}

function ServiceIcon({ service }: { service: string }) {
  switch (service) {
    case "plex":
      return <PlexIcon className="w-5 h-5" />
    case "tautulli":
      return <TautulliIcon className="w-5 h-5" />
    case "sonarr":
      return <SonarrIcon className="w-5 h-5" />
    case "radarr":
      return <RadarrIcon className="w-5 h-5" />
    case "overseerr":
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      )
    case "discord":
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      )
    case "llm":
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      )
  }
}

function ServiceCard({
  serviceKey,
  status
}: {
  serviceKey: string
  status: ServiceStatus
}) {
  return (
    <div
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
      data-testid={`service-status-${serviceKey}`}
    >
      <div className="flex items-center gap-3">
        <div className={`${status.configured ? "text-slate-300" : "text-slate-500"}`}>
          <ServiceIcon service={serviceKey} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${status.configured ? "text-white" : "text-slate-400"}`}>
              {status.name}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${status.configured ? "bg-green-400" : "bg-slate-500"}`}
              title={status.configured ? "Configured" : "Not configured"}
            />
          </div>
          <div className="text-xs text-slate-500 truncate">
            {status.description}
          </div>
        </div>
      </div>
      {!status.configured && (
        <Link
          href="/admin/settings"
          className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          Configure
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  )
}

export function ServiceStatusGrid({ services }: ServiceStatusGridProps) {
  const serviceEntries = Object.entries(services) as [string, ServiceStatus][]
  const configuredCount = serviceEntries.filter(([, s]) => s.configured).length
  const totalCount = serviceEntries.length

  return (
    <div data-testid="service-status-grid">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Service Status</h2>
        <span className="text-sm text-slate-400">
          {configuredCount} of {totalCount} configured
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {serviceEntries.map(([key, status]) => (
          <ServiceCard key={key} serviceKey={key} status={status} />
        ))}
      </div>
    </div>
  )
}
