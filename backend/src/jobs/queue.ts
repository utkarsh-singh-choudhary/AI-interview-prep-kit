/**
 * A small in-memory, bounded-concurrency job queue. Kit generation is LLM- and
 * crawl-bound (seconds to tens of seconds), so running it inline on the HTTP request
 * either times out reverse proxies or ties up a request handler for a long time. This
 * queue lets POST /:id/generate return immediately (202 Accepted) while the actual
 * work happens in the background; progress is still visible via the existing
 * onStage → `stage` field on the kit document, polled with GET /:id.
 *
 * This is intentionally NOT a durable queue (no persistence, no cross-process workers).
 * It survives process restarts the same way any in-flight request would have: not at
 * all. For a multi-instance deployment, swap this module for a real queue (BullMQ/Redis,
 * SQS, etc.) behind the same `enqueue`/`getJobStatus` interface.
 */

export type JobStatus = "queued" | "running" | "done" | "failed";

interface Job {
  id: string;
  status: JobStatus;
  run: () => Promise<void>;
  error?: string;
}

const MAX_CONCURRENT = Number.parseInt(process.env.JOB_QUEUE_CONCURRENCY ?? "", 10) || 3;

const jobs = new Map<string, Job>();
const pending: string[] = [];
let running = 0;

function pump() {
  while (running < MAX_CONCURRENT && pending.length > 0) {
    const id = pending.shift()!;
    const job = jobs.get(id);
    if (!job) continue;
    running++;
    job.status = "running";
    job.run()
      .then(() => { job.status = "done"; })
      .catch((err) => { job.status = "failed"; job.error = err instanceof Error ? err.message : String(err); })
      .finally(() => { running--; pump(); });
  }
}

/** Enqueues work under `id` (idempotent per id — re-enqueuing a queued/running id is a no-op) and returns its status. */
export function enqueue(id: string, run: () => Promise<void>): JobStatus {
  const existing = jobs.get(id);
  if (existing && (existing.status === "queued" || existing.status === "running")) return existing.status;
  jobs.set(id, { id, status: "queued", run });
  pending.push(id);
  pump();
  return "queued";
}

export function getJobStatus(id: string): JobStatus | undefined {
  return jobs.get(id)?.status;
}

/** For tests: waits until the queue has no queued/running jobs left. */
export async function drain(pollMs = 10): Promise<void> {
  while (running > 0 || pending.length > 0) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** For tests: resets all in-memory state between test files/cases. */
export function _resetForTests() {
  jobs.clear();
  pending.length = 0;
  running = 0;
}
