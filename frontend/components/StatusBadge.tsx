import type { KitStatus } from "@/lib/types";

const STYLES: Record<KitStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  generating: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: KitStatus }) {
  return <span className={`badge ${STYLES[status]}`}>{status}</span>;
}
