import { createHash } from "node:crypto";

/** Deterministic normalized hash used to detect duplicate (company_url, jd) submissions. */
export function normalizedInputHash(jobDescription: string, companyUrl: string): string {
  const normJd = jobDescription.trim().replace(/\s+/g, " ").toLowerCase();
  let normUrl = companyUrl.trim().toLowerCase();
  try {
    const u = new URL(normUrl);
    u.hash = "";
    normUrl = u.origin + u.pathname.replace(/\/+$/, "/");
  } catch { /* leave as-is if unparseable; hashing still deterministic */ }
  return createHash("sha256").update(`${normUrl}\n${normJd}`).digest("hex");
}
