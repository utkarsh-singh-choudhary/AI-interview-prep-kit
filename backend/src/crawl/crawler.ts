import { config } from "../config";
import { FetchError } from "./errors";
import { safeFetch } from "./fetcher";
import { extractLinks, extractText, extractTitle } from "./htmlExtract";
import { rankLinks } from "./linkRanker";
import { RobotsChecker } from "./robots";

export interface CrawledPage { url: string; title: string; text: string; score: number; }
export interface CrawlFailure { url: string; code: string; message: string; }
export interface CrawlResult {
  homepage: CrawledPage | null;
  pages: CrawledPage[];        // includes homepage first when fetched
  failures: CrawlFailure[];
  injectionLinesRemoved: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch the supplied company URL, rank its links, follow the most relevant ones.
 * Never throws for page-level problems: they are recorded in `failures`.
 */
export async function crawlCompany(companyUrl: string): Promise<CrawlResult> {
  const result: CrawlResult = { homepage: null, pages: [], failures: [], injectionLinesRemoved: 0 };
  const robots = new RobotsChecker();
  const fail = (url: string, err: unknown) => {
    const e = err instanceof FetchError ? err : new FetchError("NETWORK", (err as Error).message);
    result.failures.push({ url, code: e.code, message: e.message });
  };

  let home;
  try {
    home = await safeFetch(companyUrl);
  } catch (err) {
    fail(companyUrl, err);
    return result;
  }
  const toPage = (url: string, html: string, score: number): CrawledPage => {
    const { text, injectionLinesRemoved } = extractText(html, config.crawl.maxTextCharsPerPage);
    result.injectionLinesRemoved += injectionLinesRemoved;
    return { url, title: extractTitle(html), text, score };
  };
  result.homepage = toPage(home.url, home.body, Number.MAX_SAFE_INTEGER);
  result.pages.push(result.homepage);

  const candidates = rankLinks(extractLinks(home.body, home.url), home.url, config.crawl.minLinkScore)
    .filter((l) => l.url !== home.url);
  const visited = new Set([home.url]);

  for (const link of candidates) {
    if (result.pages.length - 1 >= config.crawl.maxPages) break;
    if (visited.has(link.url)) continue;
    visited.add(link.url);
    if (!(await robots.isAllowed(link.url))) {
      result.failures.push({ url: link.url, code: "BLOCKED_BY_ROBOTS", message: "Disallowed by robots.txt" });
      continue;
    }
    await sleep(config.crawl.minDelayMs);
    try {
      const page = await safeFetch(link.url);
      result.pages.push(toPage(page.url, page.body, link.score));
    } catch (err) {
      fail(link.url, err);
    }
  }
  return result;
}
