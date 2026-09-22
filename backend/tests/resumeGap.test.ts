import { describe, it, expect } from "vitest";
import { analyzeResumeGap } from "../src/pipeline/resumeGap";
import { req } from "./fixtures";

describe("analyzeResumeGap", () => {
  it("reports every requirement as missing when no resume text is given", async () => {
    const result = await analyzeResumeGap("", [req("r1"), req("r2")]);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.match === "missing")).toBe(true);
    expect(result.items.map((i) => i.requirement_id)).toEqual(["r1", "r2"]);
  });

  it("degrades to an honest per-requirement report when the LLM is unavailable", async () => {
    // No LLM_BASE_URL/KEY/MODEL configured in the test env, so callLlmJson throws
    // synchronously; analyzeResumeGap must catch that and still cover every requirement.
    const result = await analyzeResumeGap("Some resume text about React and Node.", [req("r1"), req("r2")]);
    expect(result.items).toHaveLength(2);
    expect(result.resume_chars).toBeGreaterThan(0);
    expect(result.items.map((i) => i.requirement_id).sort()).toEqual(["r1", "r2"]);
  });

  it("returns an empty item list for an empty requirement set", async () => {
    const result = await analyzeResumeGap("Some resume", []);
    expect(result.items).toEqual([]);
  });
});
