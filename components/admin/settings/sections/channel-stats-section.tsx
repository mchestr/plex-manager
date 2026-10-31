"use client"

import { useState, useTransition, type ReactNode } from "react"

import { runChannelStatsNow, updateChannelStatsSettings } from "@/actions/admin/discord-stats"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { StatChannels } from "@/lib/discord/channel-stats/config"
import { formatChannelName } from "@/lib/discord/channel-stats/format"
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/lib/discord/channel-stats/stats"
import type { ChannelStatsSettingsData } from "@/lib/data/community-stats"

const SECTION_ID = "channel-stats"

const SAMPLE: Record<StatKey, string> = { status: "🟢", streams: "3", transcodes: "1", bandwidth: "12.5", movies: "1,204", shows: "310", episodes: "9,870" }

/** "Shows as Current Streams: 3": a format with the server name and a sample value, as the channel would read. */
const preview = (format: string, server: string, key: StatKey) => `Shows as ${formatChannelName(format, { server, value: SAMPLE[key] })}`

interface Values {
  enabled: boolean
  interval: string
  channels: StatChannels
}

/** The saved settings: the flag, the interval, and each stat that has a channel with the name it gets. */
function ChannelStatsSummary({ saved }: { saved: ChannelStatsSettingsData }) {
  const row = (key: string) => `settings-${SECTION_ID}-summary-${key}`
  const chosen = STAT_KEYS.filter((key) => saved.channels[key].channelId)
  return (
    <SettingsSummary data-testid={`settings-${SECTION_ID}-summary`}>
      <SettingsSummaryRow label="Channel updates" data-testid={row("enabled")}>
        {saved.enabled ? "On" : "Off"}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Interval" data-testid={row("interval")}>
        Every {saved.intervalMinutes} minutes
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Channels" wide data-testid={row("channels")}>
        {chosen.length === 0 ? (
          <NotSet>None set</NotSet>
        ) : (
          <div className="flex flex-col gap-2">
            <p>
              {chosen.length} of {STAT_KEYS.length} set
            </p>
            <ul className="flex flex-col gap-2" aria-label="Channels the bot renames">
              {chosen.map((key) => (
                <li key={key} className="flex flex-col gap-0.5" data-testid={row(`channel-${key}`)}>
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-medium">{STAT_LABELS[key]}</span>
                    <span className="font-mono break-all text-muted-foreground">{saved.channels[key].channelId}</span>
                  </span>
                  <span className="text-label text-muted-foreground">{preview(saved.channels[key].format, saved.serverName, key)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * Channel stats (Discord group): which channel shows which number, and how its name
 * reads. The job renames a channel only when its name would change, and
 * Discord allows two renames per channel in ten minutes, so the interval stops
 * at ten.
 *
 * The section opens on a summary of the saved settings, with "Update now",
 * which renames the channels from them. Edit swaps in the form: the flag as a
 * Checkbox, since it saves with Save (NN/g, "Toggle-switch guidelines"), the
 * interval, and each channel with its name format and a live preview. Update
 * now stays out of edit mode, where the form may hold values not yet saved.
 */
export function ChannelStatsSection({ saved, footerMeta }: { saved: ChannelStatsSettingsData; footerMeta?: ReactNode }) {
  const toast = useToast()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [running, startRun] = useTransition()

  const settings = useSettingsForm<Values>({ enabled: saved.enabled, interval: String(saved.intervalMinutes), channels: saved.channels }, async (values) => {
    const result = await updateChannelStatsSettings({ enabled: values.enabled, intervalMinutes: Number(values.interval), channels: values.channels })
    if (!result.success) {
      // Saved, but the schedule did not move: the summary shows the new values, the toast what is left to do
      if (result.code === "UPSTREAM_UNAVAILABLE") {
        setErrors({})
        toast.showError(result.error)
        return { ok: true }
      }
      const next: Record<string, string> = {}
      for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) next[path] = messages?.[0] ?? ""
      setErrors(next)
      if (Object.keys(next).length === 0) toast.showError(result.error)
      return { ok: false }
    }
    setErrors({})
    toast.showSuccess("Channel stats saved")
    return { ok: true }
  })
  const { values, form } = settings

  /** Changes fields and clears the errors they had. */
  const set = (patch: Partial<Values>) => {
    settings.set(patch)
    setErrors((prev) => {
      const next = { ...prev }
      if ("interval" in patch) delete next.intervalMinutes
      if ("channels" in patch) delete next.channels
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }
  const setChannel = (key: StatKey, patch: Partial<StatChannels[StatKey]>) => set({ channels: { ...values.channels, [key]: { ...values.channels[key], ...patch } } })
  const runNow = () =>
    startRun(async () => {
      const result = await runChannelStatsNow()
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(result.data.queued ? "Channel update queued" : "Channels updated")
    })

  return (
    <SettingsSection
      id={SECTION_ID}
      title="Channel stats"
      description="Shows live Tautulli numbers in voice channel names, for example Current Streams: 3. The Discord bot needs the Manage Channels permission."
      form={{
        ...form,
        onDiscard: () => {
          form.onDiscard()
          setErrors({})
        },
      }}
      view={<ChannelStatsSummary saved={saved} />}
      // An action on the saved values: view mode only
      after={(editing) =>
        !editing && (
          <div>
            <Button type="button" variant="secondary" onClick={runNow} loading={running} loadingLabel="Updating" data-testid="channel-stats-run">
              Update now
            </Button>
          </div>
        )
      }
      footerMeta={footerMeta}
    >
      <div className="flex flex-col gap-6" data-testid="channel-stats-settings">
        <div className="flex items-start gap-3">
          <Checkbox
            id="channel-stats-enabled"
            checked={values.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
            disabled={form.isPending}
            className="mt-0.5"
            data-testid="channel-stats-toggle"
          />
          <Label htmlFor="channel-stats-enabled">Update the channels</Label>
        </div>
        <FormField
          name="intervalMinutes"
          label="Interval"
          description="Minutes between updates, from 10 to 1440."
          error={errors.intervalMinutes}
        >
          <Input
            type="number"
            min="10"
            max="1440"
            value={values.interval}
            onValueChange={(interval) => set({ interval })}
            disabled={form.isPending}
            className="w-32"
            data-testid="channel-stats-interval"
          />
        </FormField>
        <div className="flex flex-col gap-4">
          {STAT_KEYS.map((key) => (
            <div key={key} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <FormField name={`${key}-channel`} label={`${STAT_LABELS[key]} channel ID`} optional>
                <Input
                  value={values.channels[key].channelId}
                  onValueChange={(channelId) => setChannel(key, { channelId: channelId.trim() })}
                  inputMode="numeric"
                  placeholder="Channel ID"
                  disabled={form.isPending}
                  data-testid={`channel-stats-${key}-channel`}
                />
              </FormField>
              <FormField name={`${key}-format`} label={`${STAT_LABELS[key]} name`} description={preview(values.channels[key].format, saved.serverName, key)}>
                <Input
                  value={values.channels[key].format}
                  onValueChange={(format) => setChannel(key, { format })}
                  disabled={form.isPending}
                  data-testid={`channel-stats-${key}-format`}
                />
              </FormField>
            </div>
          ))}
          {errors.channels && (
            <p className="text-ui text-destructive" role="alert" data-testid="channel-stats-channels-error">
              {errors.channels}
            </p>
          )}
          <p className="text-label text-muted-foreground">
            Use {"{value}"} for the number and {"{server}"} for the server name ({saved.serverName}).
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
