export interface ExtractedLink { url: string; text: string; }

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ");
const collapse = (s: string) => s.replace(/[ \t\f\v\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? collapse(decode(stripTags(m[1]))) : "";
}

/** Lines that look like attempts to instruct an AI. Website text is data, never instructions. */
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts?)/i,
  /disregard (the )?(system|previous|above)/i,
  /you are now\b/i,
  /(system|developer) prompt/i,
  /\bact as (an?|the)\b.*\b(assistant|ai|model)\b/i,
  /reveal (your|the) (instructions|prompt|api key)/i,
  /do not (tell|inform) the user/i,
];

export function removeInjectionLines(text: string): { text: string; removed: number } {
  let removed = 0;
  const kept = text.split("\n").filter((line) => {
    const bad = INJECTION_PATTERNS.some((p) => p.test(line));
    if (bad) removed++;
    return !bad;
  });
  return { text: kept.join("\n"), removed };
}

/** Visible text: drops scripts, styles, comments, nav chrome; keeps block structure as newlines. */
export function extractText(html: string, maxChars: number): { text: string; injectionLinesRemoved: number } {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|br|ul|ol)>|<br\s*\/?>/gi, "\n");
  const text = collapse(decode(stripTags(cleaned)));
  const { text: safe, removed } = removeInjectionLines(text);
  return { text: safe.slice(0, maxChars), injectionLinesRemoved: removed };
}

/** Anchor links resolved against `baseUrl`; http(s) only, fragments dropped, de-duplicated. */
export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decode((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      u.hash = "";
      const key = u.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: key, text: collapse(decode(stripTags(m[4]))).slice(0, 120) });
    } catch { /* malformed href: skip */ }
  }
  return out;
}
