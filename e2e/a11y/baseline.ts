import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sortKeys, type AxeCounts, type AxeSummary } from './summarize';

/**
 * The axe burn-down baseline: per-route counts that may only shrink.
 *
 * `e2e/a11y/axe-baseline.json` maps each route name in `e2e/a11y/routes.ts`
 * to its `rule|impact` node counts (see `summarize.ts`). Against it, a scan:
 *
 * - fails on a new key or a higher count, naming the rule, the route and the
 *   first three node targets;
 * - fails on a lower count or a vanished key too, asking for
 *   {@link UPDATE_COMMAND}, so the file always records today's counts.
 *
 * With `UPDATE_AXE_BASELINE=1` the writer lowers the route's entry instead,
 * and refuses any rise. A route the file does not list yet (one just added
 * to the route table) is recorded as scanned.
 *
 * @module e2e/a11y/baseline
 */

/** Route name to `rule|impact` counts. */
export type AxeBaseline = Record<string, AxeCounts>;

export const BASELINE_FILE = path.join(__dirname, 'axe-baseline.json');

export const UPDATE_COMMAND =
  'UPDATE_AXE_BASELINE=1 npx playwright test e2e/accessibility.spec.ts e2e/accessibility-setup.spec.ts';

export interface BaselineDiff {
  /** New keys or higher counts. */
  regressions: string[];
  /** Lower counts or keys that are gone. */
  improvements: string[];
}

/**
 * Compares one route's scan with its baseline entry (a missing entry counts
 * as empty, so every violation on an unlisted route is a regression).
 *
 * @example
 * ```ts
 * const baseline = { '/admin/queues': { 'color-contrast|serious': 2 } }
 * compareToBaseline('/admin/queues', { counts: { 'color-contrast|serious': 1 }, targets: {} }, baseline)
 * // => { regressions: [], improvements: ['/admin/queues: color-contrast|serious fell from 2 to 1'] }
 * ```
 */
export function compareToBaseline(route: string, summary: AxeSummary, baseline: AxeBaseline): BaselineDiff {
  const before = baseline[route] ?? {};
  const after = summary.counts;
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const [key, count] of Object.entries(after)) {
    const previous = before[key] ?? 0;
    if (count > previous) {
      const targets = (summary.targets[key] ?? []).join(', ');
      const change = previous === 0 ? `is new (${count} nodes)` : `rose from ${previous} to ${count}`;
      regressions.push(`${route}: ${key} ${change}; first targets: ${targets}`);
    }
  }
  for (const [key, previous] of Object.entries(before)) {
    const count = after[key] ?? 0;
    if (count < previous) {
      improvements.push(`${route}: ${key} fell from ${previous} to ${count}`);
    }
  }

  return { regressions, improvements };
}

/**
 * Returns `baseline` with `route` set to `counts`. Throws when that would
 * raise a count or add a key for a route the baseline already lists.
 */
export function lowerBaseline(baseline: AxeBaseline, route: string, counts: AxeCounts): AxeBaseline {
  const before = baseline[route];
  if (before) {
    const raised = Object.entries(counts)
      .filter(([key, count]) => count > (before[key] ?? 0))
      .map(([key, count]) => `${key} (${before[key] ?? 0} -> ${count})`);
    if (raised.length > 0) {
      throw new Error(
        `Refusing to raise the axe baseline for ${route}: ${raised.join(', ')}. Fix the new violations instead.`
      );
    }
  }
  return sortKeys({ ...baseline, [route]: sortKeys(counts) });
}

/** Routes the baseline lists that are not in `routeNames`. */
export function staleRoutes(baseline: AxeBaseline, routeNames: readonly string[]): string[] {
  return Object.keys(baseline).filter((route) => !routeNames.includes(route));
}

export function readBaseline(file: string = BASELINE_FILE): AxeBaseline {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8')) as AxeBaseline;
}

export function writeBaseline(baseline: AxeBaseline, file: string = BASELINE_FILE): void {
  writeFileSync(file, `${JSON.stringify(sortKeys(baseline), null, 2)}\n`);
}

/**
 * Checks one route's scan against the baseline file, or lowers the file's
 * entry when `update` is set. Throws an error that says what to do.
 */
export function enforceBaseline(options: {
  route: string;
  summary: AxeSummary;
  update: boolean;
  file?: string;
}): void {
  const { route, summary, update, file = BASELINE_FILE } = options;
  const baseline = readBaseline(file);

  if (update) {
    writeBaseline(lowerBaseline(baseline, route, summary.counts), file);
    return;
  }

  const { regressions, improvements } = compareToBaseline(route, summary, baseline);
  if (regressions.length > 0) {
    throw new Error(
      `New accessibility violations (the baseline only shrinks, so fix these):\n${regressions.join('\n')}`
    );
  }
  if (improvements.length > 0) {
    throw new Error(
      `Accessibility violations fell. Lower the baseline with:\n  ${UPDATE_COMMAND}\n${improvements.join('\n')}`
    );
  }
}
