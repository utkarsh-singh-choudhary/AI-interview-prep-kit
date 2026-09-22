import type { ZodType } from "zod";
import { LlmError } from "./errors";

export interface LlmConfig { baseUrl: string; apiKey: string; model: string; timeoutMs?: number; maxRetries?: number; label?: string; }

/**
 * Reads one or more OpenAI-compatible provider configs from the environment. The
 * primary provider is required (LLM_BASE_URL/LLM_API_KEY/LLM_MODEL). An optional
 * fallback provider (LLM_FALLBACK_BASE_URL/LLM_FALLBACK_API_KEY/LLM_FALLBACK_MODEL) is
 * tried only after the primary has exhausted its own retries — this survives a
 * provider outage or a hard rate-limit without failing the whole pipeline stage.
 */
export function readLlmConfigs(): LlmConfig[] {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model)
    throw new LlmError("HTTP_ERROR", "LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set");
  const configs: LlmConfig[] = [{ baseUrl, apiKey, model, timeoutMs: 30_000, maxRetries: 2, label: "primary" }];

  const fbBaseUrl = process.env.LLM_FALLBACK_BASE_URL;
  const fbApiKey = process.env.LLM_FALLBACK_API_KEY;
  const fbModel = process.env.LLM_FALLBACK_MODEL;
  if (fbBaseUrl && fbApiKey && fbModel) {
    configs.push({ baseUrl: fbBaseUrl, apiKey: fbApiKey, model: fbModel, timeoutMs: 30_000, maxRetries: 1, label: "fallback" });
  }
  return configs;
}

/** Back-compat single-config accessor, kept for anything that only needs the primary. */
export function readLlmConfig(): LlmConfig {
  return readLlmConfigs()[0];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

async function callOneProvider<T>(
  cfg: LlmConfig,
  system: string,
  user: string,
  schema: ZodType<T>,
): Promise<T> {
  const retries = cfg.maxRetries ?? 2;
  let lastErr: LlmError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 30_000);
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (res.status === 429) throw new LlmError("RATE_LIMITED", "LLM rate limited", 429);
      if (!res.ok) throw new LlmError("HTTP_ERROR", `LLM HTTP ${res.status}`, res.status);

      const payload = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = payload.choices?.[0]?.message?.content ?? "";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(clean(raw));
      } catch {
        throw new LlmError("INVALID_JSON", "LLM did not return valid JSON");
      }
      const validated = schema.safeParse(parsedJson);
      if (!validated.success)
        throw new LlmError("SCHEMA_INVALID", `LLM output failed schema: ${validated.error.issues.map((i) => i.path.join(".")).join(", ")}`);
      return validated.data;
    } catch (err) {
      const e = err instanceof LlmError ? err
        : (err as Error).name === "AbortError" ? new LlmError("TIMEOUT", "LLM request timed out")
        : new LlmError("NETWORK", `LLM network error: ${(err as Error).message}`);
      lastErr = e;
      if (!e.retryable || attempt === retries) break;
      await sleep(300 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr!;
}

/**
 * Calls an OpenAI-compatible /chat/completions endpoint, expecting a single JSON object
 * back (json_object response_format), parses and validates it against `schema`, and
 * retries transient failures (429/5xx/timeout/network) with exponential backoff. Never
 * sends more than `system` + `user` for the task at hand — callers keep prompts modular
 * and scoped to the one section being generated.
 *
 * When more than one provider config is available (see readLlmConfigs), each is tried in
 * order: the primary exhausts its own retries first, and only a fallback provider is
 * attempted next. Passing `cfg` explicitly opts out of fallback and calls only that one
 * config, which existing single-provider callers and tests rely on.
 */
export async function callLlmJson<T>(
  args: { system: string; user: string; schema: ZodType<T>; cfg?: LlmConfig | LlmConfig[] },
): Promise<T> {
  const configs = args.cfg ? (Array.isArray(args.cfg) ? args.cfg : [args.cfg]) : readLlmConfigs();
  let lastErr: unknown;
  for (const cfg of configs) {
    try {
      return await callOneProvider(cfg, args.system, args.user, args.schema);
    } catch (err) {
      lastErr = err;
      // fall through to the next provider, if any
    }
  }
  throw lastErr!;
}
