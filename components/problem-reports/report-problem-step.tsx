"use client"

import type { Route } from "next"
import Link from "next/link"
import { useState, useTransition } from "react"

import { reportProblem } from "@/actions/problem-reports"
import { StepHeading } from "@/components/problem-reports/step-heading"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Icon } from "@/components/ui/icon"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import type { SelectedTitle } from "@/lib/member/problem-reports"
import { asksDevice, needsNote, PROBLEM_KINDS, problemsOf, showsTranscodeTip, type ProblemCode, type ProblemKind } from "@/lib/problem-reports/taxonomy"
import { icons } from "@/lib/ui/icons"
import { PROBLEM_NOTE_MAX, type DeviceAnswer } from "@/lib/validations/problem-reports"

const WHOLE_SHOW = "show"
const PLAYBACK_GUIDE = "/help#playback" as Route

const DEVICE_ANSWERS: { value: DeviceAnswer; label: string }[] = [
  { value: "others_play", label: "Yes, others play fine" },
  { value: "nothing_plays", label: "No, nothing plays" },
  { value: "not_tried", label: "I haven't tried" },
]

const guideLink = (text: string, testId: string) => (
  <Link href={PLAYBACK_GUIDE} className="text-foreground underline underline-offset-3" data-testid={testId}>
    {text}
  </Link>
)

interface ReportProblemStepProps {
  selected: SelectedTitle
  kind: ProblemKind
  onBack: () => void
  onSent: (joined: boolean) => void
}

/**
 * Step 2: the problem, a show's episode, "Does anything else play on
 * {player}?" for playback problems when the member's last player is known,
 * a note (required for "Something else"), what happens next, and the button
 * named for it. A converted last play first explains itself for picture
 * problems. Choosing a radio never moves on by itself.
 */
export function ReportProblemStep({ selected, kind, onBack, onSent }: ReportProblemStepProps) {
  const { showError } = useToast()
  const problems = problemsOf(kind)
  const [problem, setProblem] = useState<ProblemCode | null>(problems.length === 1 ? problems[0].code : null)
  const [episode, setEpisode] = useState(WHOLE_SHOW)
  const [note, setNote] = useState("")
  const [device, setDevice] = useState<DeviceAnswer | null>(null)
  const [pending, startTransition] = useTransition()
  const player = selected.lastPlay?.player ?? null
  const askDevice = problem !== null && asksDevice(problem) && player !== null
  const transcodeTip = problem !== null && showsTranscodeTip(problem) && selected.lastPlay?.transcoded === true

  const noteRequired = problem !== null && needsNote(problem)
  const canSend = problem !== null && (!noteRequired || note.trim() !== "")
  const episodes = kind !== "episodes" && selected.episodes?.length ? selected.episodes : null
  const episodeItems = episodes ? [{ value: WHOLE_SHOW, label: "The whole show" }, ...episodes.map((e) => ({ value: e.ratingKey, label: e.label }))] : []

  const send = () => {
    if (!problem) return
    startTransition(async () => {
      const ratingKey = episode === WHOLE_SHOW ? selected.ratingKey : episode
      const result = await reportProblem({ ratingKey, problem, note, device: askDevice && device ? device : undefined })
      if (!result.success) {
        showError(result.error)
        return
      }
      onSent(result.data.joined)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <StepHeading>{PROBLEM_KINDS.find((entry) => entry.id === kind)?.label}</StepHeading>
      {problems.length > 1 && (
        <div className="flex flex-col gap-2">
          <p id="report-problem-label" className="text-label text-muted-foreground">
            Which problem?
          </p>
          <RadioGroup value={problem} onValueChange={setProblem} aria-labelledby="report-problem-label" data-testid="report-problems">
            {problems.map((entry) => (
              <RadioCard key={entry.code} value={entry.code} data-testid={`report-problem-${entry.code}`}>
                <span className="text-ui text-foreground">{entry.label}</span>
              </RadioCard>
            ))}
          </RadioGroup>
        </div>
      )}
      {episodes && (
        <Field>
          <FieldLabel>Which episode?</FieldLabel>
          <Select items={episodeItems} value={episode} onValueChange={(next) => next && setEpisode(next)}>
            <SelectTrigger data-testid="report-episode-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {episodeItems.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`report-episode-option-${item.value}`}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {transcodeTip && (
        <p className="text-ui text-foreground" data-testid="report-transcode-tip">
          Your Plex app converted this video while you watched, which lowers quality and can cause buffering.{" "}
          {guideLink("Get the best picture", "report-transcode-guide")}
        </p>
      )}
      {askDevice && (
        <div className="flex flex-col gap-2">
          <p id="report-device-label" className="text-label text-muted-foreground" data-testid="report-device-question">
            Does anything else play on {player}?
          </p>
          <RadioGroup value={device} onValueChange={setDevice} aria-labelledby="report-device-label" data-testid="report-device">
            {DEVICE_ANSWERS.map((answer) => (
              <RadioCard key={answer.value} value={answer.value} data-testid={`report-device-${answer.value}`}>
                <span className="text-ui text-foreground">{answer.label}</span>
              </RadioCard>
            ))}
          </RadioGroup>
          {(device === "nothing_plays" || device === "not_tried") && (
            <p className="text-ui text-muted-foreground" data-testid="report-device-tips">
              Restarting the Plex app, or the device, often fixes this. {guideLink("Playback tips", "report-device-guide")}
            </p>
          )}
        </div>
      )}
      <Field>
        <FieldLabel optional={!noteRequired}>{noteRequired ? "What's wrong?" : "Add a note"}</FieldLabel>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={PROBLEM_NOTE_MAX} rows={3} data-testid="report-note" />
      </Field>
      <p className="text-ui text-muted-foreground" data-testid="report-consequence">
        The server admin will take a look. We'll message you when it's done.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack} data-testid="report-back">
          <Icon icon={icons.back} />
          Back
        </Button>
        <Button onClick={send} disabled={!canSend} loading={pending} loadingLabel="Sending" data-testid="report-send">
          Send to the server admin
        </Button>
      </div>
    </div>
  )
}
