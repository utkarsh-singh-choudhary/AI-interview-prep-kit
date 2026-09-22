import { safeFetch } from "./fetcher";

interface Rule { allow: boolean; path: string; }

/** Parse robots.txt rules that apply to `*` (longest-match wins; Allow beats Disallow on ties). */
export function parseRobots(text: string): Rule[] {
  const rules: Rule[] = [];
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      // Only the "*" group is honoured; a new user-agent line starts a new group.
      applies = value === "*";
    } else if (applies && (key === "allow" || key === "disallow") && value) {
      rules.push({ allow: key === "allow", path: value });
    }
  }
  return rules;
}

export function isAllowedByRules(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | undefined;
  for (const r of rules) {
    if (!pathAndQuery.startsWith(r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export class RobotsChecker {
  private cache = new Map<string, Rule[]>();

  async isAllowed(url: string): Promise<boolean> {
    const u = new URL(url);
    let rules = this.cache.get(u.origin);
    if (!rules) {
      try {
        const page = await safeFetch(`${u.origin}/robots.txt`, { retries: 0 });
        rules = parseRobots(page.body);
      } catch {
        rules = []; // no robots.txt or unreachable: treat as allowed
      }
      this.cache.set(u.origin, rules);
    }
    return isAllowedByRules(rules, u.pathname + u.search);
  }
}
