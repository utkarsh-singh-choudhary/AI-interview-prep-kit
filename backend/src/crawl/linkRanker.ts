import type { ExtractedLink } from "./htmlExtract";

const KEYWORD_WEIGHTS: Array<[RegExp, number]> = [
  [/interview/i, 6], [/hiring|how-we-hire|recruit/i, 6], [/career|jobs?\b|join-us|work-with-us|openings/i, 5],
  [/engineering|tech-blog|handbook/i, 4], [/culture|values|principles/i, 4],
  [/about|company|who-we-are|mission|team/i, 3], [/blog|process/i, 1],
];
const NEGATIVE = /(login|signin|sign-in|signup|cart|checkout|privacy|terms|cookie|unsubscribe|\.(pdf|zip|png|jpe?g|gif|svg|css|js|mp4))(\b|$)/i;

export interface RankedLink extends ExtractedLink { score: number; }

/** Same host (ignoring a leading www.) is required; scoring uses URL path and anchor text. */
export function sameSite(a: string, b: string): boolean {
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "") + ":" + (new URL(u).port || "");
  return host(a) === host(b);
}

export function rankLinks(links: ExtractedLink[], baseUrl: string, minScore = 1): RankedLink[] {
  const ranked: RankedLink[] = [];
  for (const link of links) {
    if (!sameSite(link.url, baseUrl)) continue;
    const u = new URL(link.url);
    if (NEGATIVE.test(u.pathname)) continue;
    let score = 0;
    for (const [re, w] of KEYWORD_WEIGHTS) {
      if (re.test(u.pathname)) score += w;
      if (re.test(link.text)) score += Math.ceil(w / 2);
    }
    if (u.pathname.split("/").filter(Boolean).length > 3) score -= 1; // deep pages are less likely hubs
    if (score >= minScore) ranked.push({ ...link, score });
  }
  return ranked.sort((x, y) => y.score - x.score || x.url.localeCompare(y.url));
}
