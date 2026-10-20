# Rewind 2026 model selection (P5.13)

Status: **pending the bake-off.** The harness is built and runs offline on
recordings; the live runs need API keys and are the owner's. Decision Q9
(provider preference, due 2026-11-16) closes here.

## Runbook

1. **Tune, from 2026-11-16.** Five fixtures on each candidate, effort low:

   ```bash
   npm run eval:rewind -- --model=anthropic:claude-sonnet-5-5 --effort=low --fixtures=heavy,median,night-owl,hostile-titles,single-title
   npm run eval:rewind -- --model=openai:gpt-6.1-sol --effort=low --fixtures=heavy,median,night-owl,hostile-titles,single-title
   ```

   Each prompt edit bumps `PROMPT_VERSION` to `rewind-2026.1-rc.N` until
   P8.1's freeze on 2026-11-30.
2. **Bake-off, 18-20 November.** Full sweeps with the cross-family judge, recorded:

   ```bash
   npm run eval:rewind -- --model=anthropic:claude-sonnet-5-5 --effort=low --judge=openai:gpt-6-astra --record
   npm run eval:rewind -- --model=openai:gpt-6.1-sol --effort=low --judge=anthropic:claude-opus-5-5 --record
   # optional: gemini-4-argon (its price doubles on 2026-12-01) and one pinned Ollama tag
   npm run eval:rewind -- --model=google:gemini-4-argon --effort=low --judge=anthropic:claude-opus-5-5 --record
   npm run eval:rewind -- --model=ollama:qwen3.6:27b --allow-unpriced --judge=anthropic:claude-opus-5-5 --record
   npm run eval:rewind:select
   ```

   Budget (P2.10): about $5-15 per candidate sweep and $5 per judge sweep,
   within the $75 season cap.
3. **Record the decision** below; set `evals/rewind/selected.json` (`model`,
   `economy`, `effort`, `decidedOn`); set `budgetModelFor()` in
   `lib/llm/models.ts` if the economy model changes; commit `selected.json`,
   the winner's `recordings/<model-slug>/` and its results file; configure the
   production `wrapped` `LLMProvider` row (model and effort).

## Results

Paste the `npm run eval:rewind:select` table here.

| Model | Fixtures | First-pass | After repair | Gates | Judge | Cost | p95 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Decision

| Item | Value |
|---|---|
| Default model | pending |
| Economy (repair) model, same provider | pending |
| Effort | pending (low planned) |
| Local preset (95% first-pass, 100% after repair) | pending |
| Reasons | pending |
| Decided by, on | pending |
