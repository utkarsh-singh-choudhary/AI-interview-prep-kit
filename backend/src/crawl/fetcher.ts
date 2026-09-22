import { config } from "../config";
import { FetchError } from "./errors";
import { assertUrlAllowed } from "./urlGuard";

export interface FetchedPage { url: string; status: number; contentType: string; body: string; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read a response body, aborting once maxBytes is exceeded. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FetchError("TOO_LARGE", "Response too large");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchError("TOO_LARGE", "Response exceeded size limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchOnce(startUrl: string): Promise<FetchedPage> {
  const { timeoutMs, maxBytes, maxRedirects, userAgent, allowedContentTypes } = config.fetch;
  let current = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertUrlAllowed(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": userAgent, accept: "text/html,text/plain;q=0.9" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        await res.body?.cancel();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new FetchError("HTTP_ERROR", `HTTP ${res.status} for ${current}`, res.status);
      }
      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!(allowedContentTypes as readonly string[]).includes(contentType)) {
        await res.body?.cancel();
        throw new FetchError("UNSUPPORTED_CONTENT_TYPE", `Unsupported content type: ${contentType || "unknown"}`);
      }
      const body = await readCapped(res, maxBytes);
      return { url: current, status: res.status, contentType, body };
    } catch (err) {
      if (err instanceof FetchError) throw err;
      if ((err as Error).name === "AbortError") throw new FetchError("TIMEOUT", `Timed out after ${timeoutMs}ms`);
      throw new FetchError("NETWORK", `Network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchError("TOO_MANY_REDIRECTS", "Too many redirects");
}

/** Fetch with SSRF guard, size/type/time limits, and retry with exponential backoff. */
export async function safeFetch(url: string, opts: { retries?: number } = {}): Promise<FetchedPage> {
  const retries = opts.retries ?? config.fetch.maxRetries;
  let lastError: FetchError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      if (!(err instanceof FetchError)) throw err;
      lastError = err;
      if (!err.retryable || attempt === retries) break;
      await sleep(config.fetch.backoffBaseMs * 2 ** attempt);
    }
  }
  throw lastError!;
}
