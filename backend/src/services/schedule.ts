import type { Question, Requirement, ScheduleDay } from "../domain/types";

const MIN_DAY_MINUTES = 30;
const MINUTES_PER_QUESTION = 15;
const REVIEW_MINUTES = 30;

/**
 * Deterministic schedule. Questions are ordered by (touches a must-have, difficulty desc,
 * original index) so hard/high-priority material lands early, then split into
 * `daysAvailable` contiguous near-equal chunks. With fewer questions than days, trailing
 * days become review days. Every question appears exactly once.
 */
export function buildSchedule(
  requirements: Requirement[],
  questions: Question[],
  daysAvailable: number,
): ScheduleDay[] {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1) throw new Error("daysAvailable must be an integer >= 1");
  const mustIds = new Set(requirements.filter((r) => r.priority === "must").map((r) => r.id));
  const reqById = new Map(requirements.map((r) => [r.id, r]));

  const ranked = questions
    .map((q, index) => ({ q, index, must: q.requirement_ids.some((id) => mustIds.has(id)) ? 1 : 0 }))
    .sort((a, b) => b.must - a.must || b.q.difficulty - a.q.difficulty || a.index - b.index)
    .map((x) => x.q);

  const base = Math.floor(ranked.length / daysAvailable);
  const extra = ranked.length % daysAvailable;
  const days: ScheduleDay[] = [];
  let cursor = 0;
  for (let d = 0; d < daysAvailable; d++) {
    const size = base + (d < extra ? 1 : 0);
    const chunk = ranked.slice(cursor, cursor + size);
    cursor += size;
    if (chunk.length === 0) {
      days.push({ day: d + 1, focus: "Review weak flashcards and rehearse answers aloud", question_ids: [], minutes: REVIEW_MINUTES });
      continue;
    }
    days.push({
      day: d + 1,
      focus: describeFocus(chunk, reqById),
      question_ids: chunk.map((q) => q.id),
      minutes: Math.max(MIN_DAY_MINUTES, chunk.length * MINUTES_PER_QUESTION),
    });
  }
  return days;
}

function describeFocus(chunk: Question[], reqById: Map<string, Requirement>): string {
  const counts = new Map<string, number>();
  for (const q of chunk) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const firstReq = chunk.flatMap((q) => q.requirement_ids).map((id) => reqById.get(id)).find(Boolean);
  return firstReq ? `${top} questions — starting with: ${firstReq.text}`.slice(0, 160) : `${top} questions`;
}
