"use client"

import { useState, useTransition, type ReactNode } from "react"

import { runChannelStatsNow, updateChannelStatsSettings } from "@/actions/admin/discord-stats"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsSection } from "@/components/ui/settings-section"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { useSettingsForm } from "@/hooks/admin/use-settings-form"
import type { StatChannels } from "@/lib/discord/channel-stats/config"
import { formatChannelName } from "@/lib/discord/channel-stats/format"
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/lib/discord/channel-stats/stats"
import type { ChannelStatsSettingsData } from "@/lib/data/community-stats"

const SAMPLE: Record<StatKey, string> = { status: "🟢", streams: "3", transcodes: "1", bandwidth: "12.5", movies: "1,204", shows: "310", episodes: "9,870" }

interface Values {
  enabled: boolean
  interval: string
  channels: StatChannels
}

/**
 * Discord stat channels: which channel shows which number, and how its name
 * reads. The job renames a channel only when its name would change, and
 * Discord allows two renames per channel in ten minutes, so the interval stops
 * at ten.
 */
export function ChannelStatsSection({ saved, footerMeta }: { saved: ChannelStatsSettingsData; footerMeta?: ReactNode }) {
  const toast = useToast()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [running, startRun] = useTransition()

  const settings = useSettingsForm<Values>({ enabled: saved.enabled, interval: String(saved.intervalMinutes), channels: saved.channels }, async (values) => {
    const result = await updateChannelStatsSettings({ enabled: values.enabled, intervalMinutes: Number(values.interval), channels: values.channels })
    if (!result.success) {
      const next: Record<string, string> = {}
      for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) next[path] = messages?.[0] ?? ""
      setErrors(next)
      if (Object.keys(next).length === 0) toast.showError(result.error)
      return
    }
    setErrors({})
    toast.showSuccess("Channel stats saved")
  })
  const { values, set, form } = settings

  const setChannel = (key: StatKey, patch: Partial<StatChannels[StatKey]>) => set({ channels: { ...values.channels, [key]: { ...values.channels[key], ...patch } } })
  const runNow = () =>
    startRun(async () => {
      const result = await runChannelStatsNow()
      if (!result.success) toast.showError(result.error)
      else toast.showSuccess(result.data.queued ? "Channel update queued" : "Channels updated")
    })

  return (
    <SettingsSection
      id="channel-stats"
      title="Discord channel stats"
      description="Renames voice channels with live numbers from Tautulli, such as Current Streams: 3. Needs the Discord bot with the Manage Channels permission."
      form={form}
      footerMeta={footerMeta}
    >
      <div className="flex flex-col gap-6" data-testid="channel-stats-settings">
        <div className="flex items-start gap-3">
          <Switch
            id="channel-stats-enabled"
            checked={values.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
            disabled={form.isPending}
            data-testid="channel-stats-toggle"
          />
          <div className="flex flex-col">
            <Label htmlFor="channel-stats-enabled">Update the channels</Label>
            <span className="text-label text-muted-foreground">Channels without an ID are left alone.</span>
          </div>
        </div>
        <FormField
          name="intervalMinutes"
          label="Interval"
          description="Minutes between updates, from 10 to 1440. Discord allows two renames per channel in ten minutes."
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
              <FormField name={`${key}-channel`} label={`${STAT_LABELS[key]} channel ID`} optional >
                <Input
                  value={values.channels[key].channelId}
                  onValueChange={(channelId) => setChannel(key, { channelId: channelId.trim() })}
                  inputMode="numeric"
                  placeholder="Channel ID"
                  disabled={form.isPending}
                  data-testid={`channel-stats-${key}-channel`}
                />
              </FormField>
              <FormField
                name={`${key}-format`}
                label={`${STAT_LABELS[key]} name`}
                description={`Shows as ${formatChannelName(values.channels[key].format, { server: saved.serverName, value: SAMPLE[key] })}`}
                              >
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
        <div>
          <Button type="button" variant="secondary" onClick={runNow} loading={running} loadingLabel="Updating" disabled={form.isDirty} data-testid="channel-stats-run">
            Update now
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
