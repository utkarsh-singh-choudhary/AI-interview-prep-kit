import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, getJobStatus, drain, _resetForTests } from "../src/jobs/queue";

describe("job queue", () => {
  beforeEach(() => _resetForTests());

  it("runs an enqueued job to completion", async () => {
    let ran = false;
    enqueue("job-1", async () => { ran = true; });
    await drain();
    expect(ran).toBe(true);
    expect(getJobStatus("job-1")).toBe("done");
  });

  it("marks a throwing job as failed without crashing the queue", async () => {
    enqueue("job-2", async () => { throw new Error("boom"); });
    await drain();
    expect(getJobStatus("job-2")).toBe("failed");
  });

  it("re-enqueuing the same id while queued/running is a no-op", async () => {
    let runs = 0;
    let resolveFirst: () => void = () => {};
    const blocker = new Promise<void>((r) => { resolveFirst = r; });
    enqueue("job-3", async () => { runs++; await blocker; });
    const status = enqueue("job-3", async () => { runs++; });
    expect(status).toBe("running");
    resolveFirst();
    await drain();
    expect(runs).toBe(1);
  });

  it("keeps processing other jobs when one fails", async () => {
    enqueue("fails", async () => { throw new Error("nope"); });
    let otherRan = false;
    enqueue("succeeds", async () => { otherRan = true; });
    await drain();
    expect(getJobStatus("fails")).toBe("failed");
    expect(getJobStatus("succeeds")).toBe("done");
    expect(otherRan).toBe(true);
  });
});
