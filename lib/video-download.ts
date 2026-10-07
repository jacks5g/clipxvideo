/** Watch-page downloader: YouTube/Twitch link -> direct MP4 -> Storj. */
import { uploadVideoFromUrl } from "./storj";
export type ResolvedDirectVideo = { directUrl: string; filename: string | null; service: string | null };
function cobaltEndpoint(): string {
  const raw = (process.env.COBALT_API_URL ?? "https://api.cobalt.tools").trim();
  return (raw || "https://api.cobalt.tools").replace(/\/+$/, "");
}
function cobaltHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const key = (process.env.COBALT_API_KEY ?? "").trim();
  if (key) h.Authorization = `Api-Key ${key}`;
  return h;
}
type CobaltRes = { status?: string; url?: string; filename?: string; service?: string; picker?: Array<{ type?: string; url?: string }>; error?: { code?: string } | string };
export async function resolveWatchPageToDirectUrl(sourceUrl: string): Promise<ResolvedDirectVideo> {
  const endpoint = cobaltEndpoint();
  // New Cobalt API: POST {base}/ with { url, videoQuality, downloadMode }.
  // Legacy public instance: POST {base}/api/json with { url }. Try the
  // configured endpoint first, then fall back to the other shape.
  const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
    { url: endpoint, body: { url: sourceUrl, videoQuality: "720", downloadMode: "auto", filenameStyle: "basic" } },
  ];
  if (!/\/api\/json$/i.test(endpoint)) attempts.push({ url: `${endpoint}/api/json`, body: { url: sourceUrl } });
  let lastErr = "";
  for (const a of attempts) {
    try {
      const r = await tryCobaltOnce(a.url, a.body, sourceUrl);
      if (r) return r;
    } catch (err) { lastErr = (err as Error).message; }
  }
  throw new Error(lastErr || "Downloader failed with no playable URL.");
}
async function tryCobaltOnce(endpoint: string, body: Record<string, unknown>, sourceUrl: string): Promise<ResolvedDirectVideo | null> {
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", headers: cobaltHeaders(), body: JSON.stringify(body) });
  } catch (err) {
    throw new Error(`Downloader unreachable (${endpoint}): ${(err as Error).message}. Self-host Cobalt and set COBALT_API_URL.`);
  }
  const text = await res.text().catch(() => "");
  let json: CobaltRes = {};
  try { json = text ? (JSON.parse(text) as CobaltRes) : {}; }
  catch { throw new Error(`Downloader non-JSON (${res.status}): ${text.slice(0, 200) || res.statusText}. Check COBALT_API_URL.`); }
  if (!res.ok || json.status === "error") {
    const code = typeof json.error === "string" ? json.error : (json.error?.code ?? `http-${res.status}`);
    const svc = /twitch/i.test(sourceUrl) ? "Twitch" : "YouTube";
    throw new Error(`Could not download this ${svc} link (${code}). It may be private, age-restricted, live, or region-locked. Try a public video or upload the file directly.`);
  }
  if ((json.status === "tunnel" || json.status === "redirect") && typeof json.url === "string" && /^https?:\/\//i.test(json.url))
    return { directUrl: json.url, filename: json.filename ?? null, service: json.service ?? null };
  if (json.status === "picker" && Array.isArray(json.picker)) {
    const vid = json.picker.find((p) => p?.type === "video" && /^https?:\/\//i.test(p.url ?? "")) ?? json.picker.find((p) => /^https?:\/\//i.test(p.url ?? ""));
    if (vid?.url) return { directUrl: vid.url, filename: json.filename ?? null, service: json.service ?? null };
  }
  if (typeof json.url === "string" && /^https?:\/\//i.test(json.url) && (!json.status || /success|stream|redirect|tunnel/i.test(json.status)))
    return { directUrl: json.url, filename: json.filename ?? null, service: json.service ?? null };
  // Unknown shape (e.g. endpoint is an HTML page / wrong path) — return null
  // so the caller tries the next endpoint shape instead of failing outright.
  if (!json.status && !json.url) return null;
  throw new Error(`Downloader returned "${json.status ?? "unknown"}" with no playable URL. The video may be a live stream — upload the file directly instead.`);
}
export async function downloadWatchPageToStorj(sourceUrl: string, destKey: string, opts?: { contentType?: string; metadata?: Record<string, string> }) {
  const r = await resolveWatchPageToDirectUrl(sourceUrl);
  return uploadVideoFromUrl(r.directUrl, destKey, { contentType: opts?.contentType || "video/mp4", metadata: opts?.metadata });
}
