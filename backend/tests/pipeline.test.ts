import { describe, it, expect } from "vitest";
import { generateKit, PipelineError } from "../src/pipeline/orchestrator";
import type { CrawlResult } from "../src/crawl/crawler";

const fakeCrawl: CrawlResult = {
  homepage: { url: "http://acme.test/", title: "Acme Rockets", text: "We build rockets for Mars missions.", score: Infinity },
  pages: [{ url: "http://acme.test/", title: "Acme Rockets", text: "We build rockets for Mars missions.", score: Infinity }],
  failures: [],
  injectionLinesRemoved: 0,
};

function mockFetchSequence(handlers: Array<(body: any) => any>) {
  let i = 0;
  (globalThis as any).fetch = async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i++;
    const content = handler(body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as any;
  };
}

const reqResponse = { requirements: [{ text: "5+ years React", kind: "technical", priority: "must" }, { text: "Mentor juniors", kind: "behavioural", priority: "nice" }] };
const roleResponse = { title: "Senior Frontend Engineer", seniority: "senior", responsibilities: ["Build UI", "Mentor"] };
const briefResponse = { summary: "Acme builds rockets.", what_they_do: "Aerospace." };
const questionsFor = (reqs: any[]) => ({ questions: reqs.map((r: any, i: number) => ({ requirement_ids: [r.id ?? `r${i + 1}`], prompt: `Q about ${r.text ?? "topic"}`, answer_outline: "outline", difficulty: 2 })) });

describe("generateKit orchestrator", () => {
  it("runs the full pipeline end to end with a valid kit", async () => {
    process.env.LLM_BASE_URL = "http://fake"; process.env.LLM_API_KEY = "k"; process.env.LLM_MODEL = "m";
    let call = 0;
    (globalThis as any).fetch = async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      call++;
      const sys = body.messages[0].content as string;
      let content: any;
      if (sys.includes("extract job requirements")) content = reqResponse;
      else if (sys.includes("job title")) content = roleResponse;
      else if (sys.includes("company brief")) content = briefResponse;
      else if (sys.includes("technical questions")) content = questionsFor([{ id: "r1", text: "React" }]);
      else if (sys.includes("behavioral")) content = questionsFor([{ id: "r2", text: "Mentor" }]);
      else content = { questions: [] };
      if (sys.includes("flashcards")) content = { flashcards: [{ front: "React?", back: "A UI library", requirement_ids: ["r1"] }] };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) } as any;
    };

    const kit = await generateKit({
      jobDescription: "Senior Frontend Engineer. 5+ years React required. Mentor junior engineers.",
      companyUrl: "http://acme.test/",
      daysAvailable: 5,
      crawler: async () => fakeCrawl,
    });

    expect(kit.role.requirements).toHaveLength(2);
    expect(kit.schedule.days).toHaveLength(5);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.source.company).toBe("Acme Rockets");
    expect(call).toBeGreaterThan(0);
  });

  it("rejects empty JD, invalid URL and bad day counts without calling the LLM", async () => {
    await expect(generateKit({ jobDescription: "  ", companyUrl: "http://x/", daysAvailable: 3 })).rejects.toBeInstanceOf(PipelineError);
    await expect(generateKit({ jobDescription: "JD", companyUrl: "not-a-url", daysAvailable: 3 })).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(generateKit({ jobDescription: "JD", companyUrl: "http://x/", daysAvailable: 0 })).rejects.toMatchObject({ code: "INVALID_DAYS" });
  });

  it("produces a thin kit for a thin JD without hallucinating requirements", async () => {
    process.env.LLM_BASE_URL = "http://fake"; process.env.LLM_API_KEY = "k"; process.env.LLM_MODEL = "m";
    mockFetchSequence([
      () => ({ requirements: [] }),
      () => roleResponse,
      () => briefResponse,
      () => ({ questions: [] }),
    ]);
    const kit = await generateKit({ jobDescription: "Backend role.", companyUrl: "http://acme.test/", daysAvailable: 2, crawler: async () => fakeCrawl });
    expect(kit.role.requirements).toEqual([]);
    expect(kit.questions).toEqual([]);
    expect(kit.schedule.days).toHaveLength(2);
  });

  it("stays honest and does not crash when the company is unreachable", async () => {
    process.env.LLM_BASE_URL = "http://fake"; process.env.LLM_API_KEY = "k"; process.env.LLM_MODEL = "m";
    mockFetchSequence([
      () => ({ requirements: [{ text: "Go", kind: "technical", priority: "must" }] }),
      () => roleResponse,
      () => ({ summary: "No reliable company information could be retrieved from the provided URL.", what_they_do: "" }),
      () => questionsFor([{ id: "r1", text: "Go" }]),
    ]);
    const kit = await generateKit({
      jobDescription: "Go engineer needed.", companyUrl: "http://acme.test/", daysAvailable: 3,
      crawler: async () => ({ homepage: null, pages: [], failures: [{ url: "http://acme.test/", code: "NETWORK", message: "unreachable" }], injectionLinesRemoved: 0 }),
    });
    expect(kit.source.pages_used).toEqual([]);
    expect(kit.company_brief.sources).toEqual([]);
  });
});
