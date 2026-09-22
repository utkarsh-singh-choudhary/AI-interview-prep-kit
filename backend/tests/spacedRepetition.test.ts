import { describe, it, expect } from "vitest";
import { confidenceToQuality, gradeCard, sortByDue, MIN_EASE_FACTOR, INITIAL_EASE_FACTOR } from "../src/services/spacedRepetition";

describe("confidenceToQuality", () => {
  it("maps the 1..5 confidence scale onto SM-2's 0..5 quality scale", () => {
    expect(confidenceToQuality(1)).toBe(0);
    expect(confidenceToQuality(3)).toBe(3); // 3 -> midpoint*5/4 rounds to 3
    expect(confidenceToQuality(5)).toBe(5);
  });
});

describe("gradeCard", () => {
  const day0 = new Date("2026-01-01T00:00:00Z");

  it("a never-seen card graded well starts the standard 1/6 day ladder", () => {
    const first = gradeCard(undefined, 5, day0);
    expect(first.repetitions).toBe(1);
    expect(first.intervalDays).toBe(1);

    const second = gradeCard(first, 5, addDays(day0, 1));
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);

    const third = gradeCard(second, 5, addDays(day0, 7));
    expect(third.repetitions).toBe(3);
    // interval grows by the (now-updated) ease factor from here on
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it("a failed recall (quality < 3) resets repetitions and restarts at 1 day", () => {
    const good = gradeCard(undefined, 5, day0);
    const good2 = gradeCard(good, 5, addDays(day0, 1));
    const failed = gradeCard(good2, 1, addDays(day0, 7));
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(1);
  });

  it("ease factor never drops below the SM-2 floor even under repeated failure", () => {
    let state = gradeCard(undefined, 0, day0);
    for (let i = 0; i < 20; i++) state = gradeCard(state, 0, addDays(day0, i + 1));
    expect(state.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
  });

  it("a perfect run keeps ease factor at or above the starting value", () => {
    let state = gradeCard(undefined, 5, day0);
    for (let i = 0; i < 5; i++) state = gradeCard(state, 5, addDays(day0, (i + 1) * state.intervalDays));
    expect(state.easeFactor).toBeGreaterThanOrEqual(INITIAL_EASE_FACTOR);
  });

  it("dueAt is exactly intervalDays after `now`", () => {
    const graded = gradeCard(undefined, 4, day0);
    const expected = addDays(day0, graded.intervalDays);
    expect(graded.dueAt.getTime()).toBe(expected.getTime());
  });
});

describe("sortByDue", () => {
  it("never-seen cards (no dueAt) sort before any dated card", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const cards = [
      { id: "a", dueAt: new Date("2026-01-05T00:00:00Z") },
      { id: "b" }, // never seen
      { id: "c", dueAt: new Date("2026-01-20T00:00:00Z") },
    ];
    expect(sortByDue(cards, now).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("orders overdue cards earliest-due first", () => {
    const cards = [
      { id: "later", dueAt: new Date("2026-02-01T00:00:00Z") },
      { id: "sooner", dueAt: new Date("2026-01-01T00:00:00Z") },
    ];
    expect(sortByDue(cards).map((c) => c.id)).toEqual(["sooner", "later"]);
  });
});

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
