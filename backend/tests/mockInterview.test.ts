import { describe, it, expect } from "vitest";
import { evaluateAnswer } from "../src/pipeline/mockInterview";
import { q, req } from "./fixtures";

describe("evaluateAnswer", () => {
  it("scores an empty answer as weak without calling the LLM", async () => {
    const question = q("q1", ["r1"]);
    const result = await evaluateAnswer(question, "   ", [req("r1")]);
    expect(result.score).toBe(1);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.follow_up_question).toBeTruthy();
  });

  it("propagates an LLM configuration error for a real answer rather than fabricating a score", async () => {
    const question = q("q1", ["r1"]);
    await expect(evaluateAnswer(question, "I would use a hash map for O(1) lookups.", [req("r1")]))
      .rejects.toThrow();
  });
});
