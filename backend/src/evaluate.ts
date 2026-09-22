import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { generateKit, PipelineError } from "./pipeline/orchestrator";
import { validateKit } from "./services/validation";

interface Case { id: string; jd: string; company_url: string; days: number; }
interface KitResultEntry { id: string; status: "ok" | "failed"; kit: unknown; error: { code: string; message: string } | null; }

function parseArgs(argv: string[]): { input: string; output: string } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get("--input");
  const output = get("--output");
  if (!input || !output) {
    console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
    process.exit(1);
  }
  return { input, output };
}

async function runCase(c: Case): Promise<KitResultEntry> {
  try {
    // Uses the exact same generateKit() the web app calls via POST /api/kits/:id/generate.
    const kit = await generateKit({ jobDescription: c.jd, companyUrl: c.company_url, daysAvailable: c.days });
    const validated = validateKit(kit);
    if (!validated.ok) return { id: c.id, status: "failed", kit: null, error: { code: "INVALID_KIT", message: validated.errors.join("; ") } };
    return { id: c.id, status: "ok", kit: validated.kit, error: null };
  } catch (err) {
    const code = err instanceof PipelineError ? err.code : "UNKNOWN_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    return { id: c.id, status: "failed", kit: null, error: { code, message } };
  }
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const raw = await readFile(input, "utf8");
  const cases = JSON.parse(raw) as Case[];
  if (!Array.isArray(cases)) throw new Error("Input file must contain a JSON array of cases");

  const kits: KitResultEntry[] = [];
  for (const c of cases) {
    console.log(`[evaluate] running ${c.id}...`);
    const result = await runCase(c); // one failing case never aborts the batch
    kits.push(result);
    console.log(`[evaluate] ${c.id}: ${result.status}`);
  }

  const out = { version: "1.0", generated_at: new Date().toISOString(), kits };
  await writeFile(output, JSON.stringify(out, null, 2), "utf8");
  const failed = kits.filter((k) => k.status === "failed").length;
  console.log(`[evaluate] done: ${kits.length - failed}/${kits.length} ok, wrote ${output}`);
}

main().catch((err) => {
  console.error("[evaluate] fatal:", err);
  process.exit(1);
});
