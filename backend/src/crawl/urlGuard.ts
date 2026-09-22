import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config";
import { FetchError } from "./errors";

/** True for loopback, private, link-local, unspecified and other non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    if (lower === "::" || lower === "::1") return true;
    if (/^f[cd]/.test(lower)) return true;      // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return true;   // fe80::/10 link-local
    return false;
  }
  return true; // not an IP: treat as unsafe
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("INVALID_URL", `Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new FetchError("INVALID_URL", `Unsupported protocol: ${url.protocol}`);
  if (url.username || url.password) throw new FetchError("INVALID_URL", "Credentials in URL are not allowed");
  return url;
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address);

/**
 * SSRF guard. Resolves the host and rejects non-public addresses unless
 * ALLOW_PRIVATE_HOSTS=true (evaluation/test mode). Called for every redirect hop.
 */
export async function assertUrlAllowed(
  raw: string,
  opts: { allowPrivate?: boolean; resolve?: Resolver } = {},
): Promise<URL> {
  const url = parseHttpUrl(raw);
  const allowPrivate = opts.allowPrivate ?? config.allowPrivateHosts;
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    throw new FetchError("BLOCKED_URL", `Blocked host: ${host}`);

  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = await (opts.resolve ?? defaultResolver)(host);
    } catch {
      throw new FetchError("NETWORK", `Could not resolve host: ${host}`);
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp))
    throw new FetchError("BLOCKED_URL", `Host resolves to a non-public address: ${host}`);
  return url;
}
