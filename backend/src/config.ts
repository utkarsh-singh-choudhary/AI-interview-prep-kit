const bool = (v: string | undefined, d = false) => (v === undefined ? d : v.toLowerCase() === "true");
const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  // getter: evaluated per call so tests/evaluator can flip the switch at runtime
  get allowPrivateHosts() { return bool(process.env.ALLOW_PRIVATE_HOSTS); },
  fetch: {
    timeoutMs: int(process.env.FETCH_TIMEOUT_MS, 8000),
    maxBytes: int(process.env.FETCH_MAX_BYTES, 1_500_000),
    maxRetries: int(process.env.FETCH_MAX_RETRIES, 2),
    backoffBaseMs: int(process.env.FETCH_BACKOFF_MS, 300),
    maxRedirects: 5,
    userAgent: "AIInterviewPrepKitBot/1.0 (+research; respects robots.txt)",
    allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
  },
  crawl: {
    maxPages: int(process.env.CRAWL_MAX_PAGES, 5),
    minDelayMs: int(process.env.CRAWL_DELAY_MS, 250),
    maxTextCharsPerPage: 8000,
    minLinkScore: 1,
  },
} as const;
