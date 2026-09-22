/**
 * SM-2 spaced repetition (the classic SuperMemo-2 algorithm), replacing the v1
 * "sort by raw confidence" queue with proper scheduling: each grade updates an ease
 * factor and an interval, and cards are due again only once that interval elapses.
 *
 * Quality is graded 0-5 on SM-2's own scale (0 = complete blackout, 5 = perfect,
 * effortless recall). The API surface elsewhere in the app still speaks in terms of
 * 1-5 "confidence"; `confidenceToQuality` maps that to SM-2's 0-5 range so existing
 * clients don't need to change vocabulary.
 */

export interface SpacedRepetitionState {
  easeFactor: number; // >= 1.3
  intervalDays: number; // days until next due
  repetitions: number; // consecutive successful (quality >= 3) reviews
  dueAt: Date;
}

export const MIN_EASE_FACTOR = 1.3;
export const INITIAL_EASE_FACTOR = 2.5;

/** Maps the app's 1 (very weak) .. 5 (very strong) confidence scale onto SM-2's 0..5 quality scale. */
export function confidenceToQuality(confidence: 1 | 2 | 3 | 4 | 5): number {
  return Math.round(((confidence - 1) * 5) / 4);
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE_FACTOR, ease);
}

/**
 * Applies one SM-2 review step. `previous` is undefined for a card never reviewed
 * before. `now` is injectable for deterministic tests.
 */
export function gradeCard(
  previous: SpacedRepetitionState | undefined,
  quality: number,
  now: Date = new Date(),
): SpacedRepetitionState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const prevEase = previous?.easeFactor ?? INITIAL_EASE_FACTOR;
  const prevReps = previous?.repetitions ?? 0;

  // Ease factor update per SM-2's original formula, floored at MIN_EASE_FACTOR.
  const easeFactor = clampEase(prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // A failed recall resets the repetition streak and restarts the interval ladder,
    // but does not throw away the (now slightly lower) ease factor.
    return { easeFactor, intervalDays: 1, repetitions: 0, dueAt: addDays(now, 1) };
  }

  const repetitions = prevReps + 1;
  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round((previous?.intervalDays ?? 6) * easeFactor);

  return { easeFactor, intervalDays, repetitions, dueAt: addDays(now, intervalDays) };
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Cards that are due (dueAt <= now, or never reviewed) sort first; ties broken by how overdue they are. */
export function sortByDue<T extends { dueAt?: Date; timesSeen?: number }>(cards: T[], now: Date = new Date()): T[] {
  return [...cards].sort((a, b) => {
    const dueA = a.dueAt?.getTime() ?? -Infinity; // never-seen cards are always "due"
    const dueB = b.dueAt?.getTime() ?? -Infinity;
    if (dueA !== dueB) return dueA - dueB;
    return (a.timesSeen ?? 0) - (b.timesSeen ?? 0);
  });
}
