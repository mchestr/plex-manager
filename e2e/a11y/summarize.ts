import type { AxeResults, NodeResult, Result } from 'axe-core';

/**
 * Turns an axe scan into per-route counts for the burn-down baseline.
 *
 * Each violating node counts once under `rule|impact` (the node's impact, or
 * the rule's when the node has none). Incomplete `color-contrast` nodes, which
 * axe could not decide (text over gradients, images or canvases), count under
 * `color-contrast|incomplete`, so they cannot hide a contrast regression.
 *
 * @example
 * ```ts
 * summarizeAxe({
 *   violations: [{ id: 'label', impact: 'critical', nodes: [{ target: ['#q'] }] }],
 *   incomplete: [{ id: 'color-contrast', impact: 'serious', nodes: [{ target: ['h1'] }] }],
 * }).counts
 * // => { 'color-contrast|incomplete': 1, 'label|critical': 1 }
 * ```
 *
 * @module e2e/a11y/summarize
 */

/** Node counts keyed by `rule|impact`. */
export type AxeCounts = Record<string, number>;

export interface AxeSummary {
  counts: AxeCounts;
  /** Up to three node targets per key, for failure messages. */
  targets: Record<string, string[]>;
}

/** The parts of a scan the summary reads (lets tests pass plain objects). */
export type AxeScan = {
  violations: Array<Pick<Result, 'id' | 'impact'> & { nodes: Array<Pick<NodeResult, 'target' | 'impact'>> }>;
  incomplete: AxeScan['violations'];
};

export const INCOMPLETE_CONTRAST_KEY = 'color-contrast|incomplete';

const MAX_TARGETS = 3;

function describeTarget(node: Pick<NodeResult, 'target'>): string {
  return node.target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : String(part))).join(' ');
}

export function summarizeAxe(results: AxeScan | AxeResults): AxeSummary {
  const counts: AxeCounts = {};
  const targets: Record<string, string[]> = {};
  const add = (key: string, node: Pick<NodeResult, 'target'>) => {
    counts[key] = (counts[key] ?? 0) + 1;
    const list = (targets[key] ??= []);
    if (list.length < MAX_TARGETS) list.push(describeTarget(node));
  };

  for (const rule of results.violations) {
    for (const node of rule.nodes) {
      add(`${rule.id}|${node.impact ?? rule.impact ?? 'unknown'}`, node);
    }
  }
  for (const rule of results.incomplete) {
    if (rule.id !== 'color-contrast') continue;
    for (const node of rule.nodes) add(INCOMPLETE_CONTRAST_KEY, node);
  }

  return { counts: sortKeys(counts), targets };
}

/** Returns `record` with its keys in sorted order, for stable JSON. */
export function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
