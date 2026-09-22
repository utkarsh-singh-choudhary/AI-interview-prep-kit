import { describe, it, expect } from "vitest";
import { findUncovered, closeCoverageGaps } from "../src/services/coverage";
import { buildSchedule } from "../src/services/schedule";
import { validateKit } from "../src/services/validation";
import { req, q, validKit } from "./fixtures";

describe("coverage", () => {
  it("finds uncovered requirements deterministically", () => {
    expect(findUncovered([req("r1"), req("r2"), req("r3")], [q("q1", ["r1"]), q("q2", ["r3"])])).toEqual(["r2"]);
  });
  it("second pass fills gaps without touching existing questions", async () => {
    const existing = [q("q1", ["r1"])];
    const res = await closeCoverageGaps([req("r1"), req("r2")], existing, async (t) => t.map((r) => q("x", [r.id])));
    expect(res.uncovered_requirement_ids).toEqual([]);
    expect(res.passes).toBe(2);
    expect(res.questions[0]).toBe(existing[0]);
    expect(res.questions[1].id).toBe("q2");
  });
  it("is bounded, strips invalid ids, reports gaps honestly", async () => {
    const res = await closeCoverageGaps([req("r1")], [], async () => [q("x", ["bogus"])]);
    expect(res.passes).toBe(3);
    expect(res.uncovered_requirement_ids).toEqual(["r1"]);
  });
  it("survives generator failure", async () => {
    const res = await closeCoverageGaps([req("r1")], [], async () => { throw new Error("llm down"); });
    expect(res.uncovered_requirement_ids).toEqual(["r1"]);
  });
});

describe("schedule", () => {
  const reqs = [req("r1"), req("r2", "nice")];
  const qs = [q("q1", ["r2"], 3), q("q2", ["r1"], 1), q("q3", ["r1"], 3), q("q4", ["r2"], 2)];
  it("returns exactly N days, integer minutes, every question once", () => {
    for (const n of [1, 3, 4, 10, 60]) {
      const days = buildSchedule(reqs, qs, n);
      expect(days).toHaveLength(n);
      expect(days.every((d) => Number.isInteger(d.minutes))).toBe(true);
      expect(days.flatMap((d) => d.question_ids).sort()).toEqual(["q1", "q2", "q3", "q4"]);
    }
  });
  it("puts must-have and difficult material first", () => {
    expect(buildSchedule(reqs, qs, 4)[0].question_ids).toEqual(["q3"]);
  });
  it("is deterministic", () => expect(buildSchedule(reqs, qs, 3)).toEqual(buildSchedule(reqs, qs, 3)));
  it("rejects invalid day counts", () => expect(() => buildSchedule(reqs, qs, 0)).toThrow());
});

describe("validation", () => {
  it("accepts a valid kit", () => expect(validateKit(validKit()).ok).toBe(true));
  it("rejects bad difficulty and enum", () => {
    const k: any = validKit(); k.questions[0].difficulty = 5; k.questions[1].category = "nope";
    expect(validateKit(k).ok).toBe(false);
  });
  it("rejects dangling requirement and question references", () => {
    const k: any = validKit(); k.questions[0].requirement_ids = ["r9"]; k.schedule.days[0].question_ids = ["q9"];
    const r = validateKit(k);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.errors.join()).toContain("r9"); expect(r.errors.join()).toContain("q9"); }
  });
  it("rejects wrong schedule length and stale coverage", () => {
    const k: any = validKit(); k.schedule.days_available = 3; k.coverage.uncovered_requirement_ids = ["r1"];
    expect(validateKit(k).ok).toBe(false);
  });
});
