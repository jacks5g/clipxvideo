/** Watch-page downloader: YouTube/Twitch link -> direct MP4 -> Storj. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { headObject, putVideoObject, uploadVideoFromUrl } from "./storj";

const execFileAsync = promisify(execFile);

export type ResolvedDirectVideo = {
  directUrl: string;
  filename: string | null;
  service: string | null;
};

type Runner = { cmd: string; baseArgs: string[] };
let cachedRunner: Runner | null | undefined = undefined;

/**
 * Returns extra yt-dlp args for cookie authentication.
 * Supports (in priority order):
 *  - YTDLP_COOKIES_FILE: path to Netscape-format cookies.txt exported
 *    from your browser ("Get cookies.txt LOCALLY" extension).
 *    Best for servers/headless where no browser profile exists.
 *  - YTDLP_COOKIES_FROM_BROWSER: e.g. "chrome", "edge", "firefox".
 *    Passed to `--cookies-from-browser`. Needs that browser installed +
 *    logged into YouTube on THIS machine.
 * Either one bypasses YouTube bot-detection / "Sign in to confirm" errors.
 * Use a throwaway YouTube account — downloader sessions get flagged.
 */
function getCookieArgs(): string[] {
  const cookiesFile = (process.env.YTDLP_COOKIES_FILE ?? "").trim();
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    return ["--cookies", cookiesFile];
  }
  const fromBrowser = (process.env.YTDLP_COOKIES_FROM_BROWSER ?? "").trim();
  if (fromBrowser) {
    return ["--cookies-from-browser", fromBrowser];
  }
  return [];
}

/**
 * Extra `--extractor-args` for YouTube bot-resistance.
 * YouTube's web player now needs a proof-of-origin token yt-dlp can't mint,
 * so the web client gets challenged even WITH cookies. Non-web clients
 * (android/tv) are scrutinised far less. Override via YTDLP_EXTRACTOR_ARGS.
 */
function getExtractorArgs(): string[] {
  const raw = (process.env.YTDLP_EXTRACTOR_ARGS ?? "").trim();
  if (raw) return ["--extractor-args", raw];
  return ["--extractor-args", "youtube:player_client=android,web,tv"];
}

/** Gentle rate-limiting so bursts of extractions don't look like a script. */
function getThrottleArgs(): string[] {
  const raw = (process.env.YTDLP_SLEEP_REQUESTS ?? "").trim();
  if (raw === "0" || raw.toLowerCase() === "off") return [];
  const secs = Number(raw) || 1;
  return ["--sleep-requests", String(secs), "--retries", "2"];
}

async function getYtDlpRunner(): Promise<Runner | null> {
  if (cachedRunner !== undefined) return cachedRunner;
  const candidates: Runner[] = [
    { cmd: "python", baseArgs: ["-m", "yt_dlp"] },
    { cmd: "py", baseArgs: ["-m", "yt_dlp"] },
    { cmd: "python3", baseArgs: ["-m", "yt_dlp"] },
    { cmd: "yt-dlp", baseArgs: [] },
  ];
  for (const c of candidates) {
    try {
      await execFileAsync(c.cmd, [...c.baseArgs, "--version"]);
      cachedRunner = c;
      return c;
    } catch {
      // try next
    }
  }
  cachedRunner = null;
  return null;
}

function ytDlpOutput(err: unknown): string {
  const e = err as { message?: string; stderr?: string; stdout?: string };
  return `${e?.stderr ?? ""}\n${e?.stdout ?? ""}\n${e?.message ?? ""}`;
}

function friendlyYtDlpError(err: unknown, sourceUrl: string): Error {
  const output = ytDlpOutput(err);
  const lower = output.toLowerCase();
  const svc = /twitch/i.test(sourceUrl) ? "Twitch" : "YouTube";
  const cookiesOn =
    Boolean((process.env.YTDLP_COOKIES_FILE ?? "").trim()) ||
    Boolean((process.env.YTDLP_COOKIES_FROM_BROWSER ?? "").trim());
  if (lower.includes("sign in to confirm") || lower.includes("not a bot")) {
    return new Error(
      `${svc} blocked this download with bot detection ("Sign in to confirm you're not a bot"). ` +
        `This fires on server/VPN IPs or cookie-less yt-dlp — not a bug in your link. ` +
        (cookiesOn
          ? `Cookies are set but YouTube still challenged the request: update yt-dlp (python -m yt_dlp -U), avoid VPNs, optionally set YTDLP_EXTRACTOR_ARGS="youtube:player_client=tv".`
          : `Fix: export YouTube cookies (throwaway account!) to cookies.txt and set YTDLP_COOKIES_FILE=/path/to/cookies.txt, ` +
            `or set YTDLP_COOKIES_FROM_BROWSER=chrome where that browser is logged in. ` +
            `Also run python -m yt_dlp -U — stale builds get challenged far more. ` +
            `Otherwise upload the video file directly.`)
    );
  }
  if (lower.includes("http error 429") || lower.includes("too many requests")) {
    return new Error(
      `${svc} is rate-limiting this server (HTTP 429). Wait a few minutes and retry; ` +
        `add cookies via YTDLP_COOKIES_FILE if it persists.`
    );
  }
  if (lower.includes("private video")) {
    return new Error(
      `This ${svc} video is private and needs an authorised account. Add cookies via YTDLP_COOKIES_FILE, or upload the file directly.`
    );
  }
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^command failed:/i.test(l));
  const tail = lines.slice(-3).join(" ").slice(0, 500);
  return new Error(
    tail
      ? `Could not download this ${svc} link (${tail}). It may be private, age-restricted, live, or region-locked. Try uploading the file directly.`
      : `Could not download this ${svc} link. It may be private, age-restricted, live, or region-locked. Try uploading the file directly.`
  );
}

async function resolveWatchPageWithYtDlp(sourceUrl: string): Promise<ResolvedDirectVideo> {
  const runner = await getYtDlpRunner();
  if (!runner) {
    throw new Error("yt-dlp is not available on this server.");
  }
  const args = [
    ...runner.baseArgs,
    "--no-warnings",
    "--no-playlist",
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    ...getCookieArgs(),
    ...getExtractorArgs(),
    ...getThrottleArgs(),
    "-f",
    "best[ext=mp4][acodec!=none]/best[acodec!=none]/best",
    "--print",
    "filename:%(title)s.%(ext)s",
    "--print",
    "url:%(url)s",
    sourceUrl,
  ];
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(runner.cmd, args, { timeout: 60000 }));
  } catch (err) {
    throw friendlyYtDlpError(err, sourceUrl);
  }
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let filename: string | null = null;
  let directUrl: string | null = null;
  for (const line of lines) {
    if (line.startsWith("filename:")) {
      filename = line.slice("filename:".length).trim();
    } else if (line.startsWith("url:")) {
      directUrl = line.slice("url:".length).trim();
    } else if (/^https?:\/\//i.test(line) && !directUrl) {
      directUrl = line;
    }
  }
  if (!directUrl) {
    throw new Error("yt-dlp could not extract a direct video stream URL.");
  }
  const service = /twitch/i.test(sourceUrl) ? "Twitch" : "YouTube";
  return { directUrl, filename, service };
}

let cachedFfmpegLocation: string | null | undefined = undefined;

function findBinaryRecursive(dir: string, binaryName: string, maxDepth: number): string | null {
  if (maxDepth < 0) return null;
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      const full = path.join(dir, f.name);
      if (f.isFile() && f.name.toLowerCase() === binaryName.toLowerCase()) {
        return full;
      }
      if (f.isDirectory() && maxDepth > 0) {
        const sub = findBinaryRecursive(full, binaryName, maxDepth - 1);
        if (sub) return sub;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getFfmpegLocation(): string | null {
  if (cachedFfmpegLocation !== undefined) return cachedFfmpegLocation;
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFfmpegLocation = fs.statSync(process.env.FFMPEG_PATH).isDirectory()
      ? process.env.FFMPEG_PATH
      : path.dirname(process.env.FFMPEG_PATH);
    return cachedFfmpegLocation;
  }
  const paths = (process.env.PATH || "").split(path.delimiter);
  for (const p of paths) {
    if (!p) continue;
    const candidate = path.join(p, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    if (fs.existsSync(candidate)) {
      cachedFfmpegLocation = p;
      return p;
    }
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const wingetPackagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPackagesDir)) {
      try {
        const entries = fs.readdirSync(wingetPackagesDir);
        for (const entry of entries) {
          if (/ffmpeg/i.test(entry)) {
            const found = findBinaryRecursive(path.join(wingetPackagesDir, entry), "ffmpeg.exe", 3);
            if (found) {
              cachedFfmpegLocation = path.dirname(found);
              return cachedFfmpegLocation;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    const commonDirs = [
      "C:\\ffmpeg\\bin",
      "C:\\Program Files\\ffmpeg\\bin",
      path.join(localAppData, "Programs", "ffmpeg", "bin"),
    ];
    for (const d of commonDirs) {
      if (fs.existsSync(path.join(d, "ffmpeg.exe"))) {
        cachedFfmpegLocation = d;
        return d;
      }
    }
  }

  cachedFfmpegLocation = null;
  return null;
}

async function downloadWithYtDlpToFile(sourceUrl: string, destPath: string): Promise<void> {
  const runner = await getYtDlpRunner();
  if (!runner) {
    throw new Error("yt-dlp is not available on this server.");
  }
  const ffmpegLoc = getFfmpegLocation();
  const args = [
    ...runner.baseArgs,
    "--no-warnings",
    "--no-playlist",
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    ...(ffmpegLoc ? ["--ffmpeg-location", ffmpegLoc] : []),
    ...getCookieArgs(),
    ...getExtractorArgs(),
    ...getThrottleArgs(),
    "-f",
    "bv*[ext=mp4][vcodec^=avc]+ba[ext=m4a]/bv*[ext=mp4]+ba[ext=m4a]/bestvideo+bestaudio/best[ext=mp4][acodec!=none]/best[acodec!=none]/best",
    "--merge-output-format",
    "mp4",
    "-o",
    destPath,
    sourceUrl,
  ];
  try {
    await execFileAsync(runner.cmd, args, { timeout: 300000 });
  } catch (err) {
    throw friendlyYtDlpError(err, sourceUrl);
  }
}

function cobaltEndpoint(): string {
  const raw = (process.env.COBALT_API_URL ?? "").trim();
  return raw.replace(/\/+$/, "");
}

function cobaltHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const key = (process.env.COBALT_API_KEY ?? "").trim();
  if (key) h.Authorization = `Api-Key ${key}`;
  return h;
}

type CobaltRes = {
  status?: string;
  url?: string;
  filename?: string;
  service?: string;
  picker?: Array<{ type?: string; url?: string }>;
  error?: { code?: string } | string;
};

async function tryCobaltOnce(
  endpoint: string,
  body: Record<string, unknown>,
  sourceUrl: string
): Promise<ResolvedDirectVideo | null> {
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", headers: cobaltHeaders(), body: JSON.stringify(body) });
  } catch (err) {
    throw new Error(`Downloader unreachable (${endpoint}): ${(err as Error).message}.`);
  }
  const text = await res.text().catch(() => "");
  let json: CobaltRes = {};
  try {
    json = text ? (JSON.parse(text) as CobaltRes) : {};
  } catch {
    throw new Error(`Downloader non-JSON (${res.status}): ${text.slice(0, 200) || res.statusText}.`);
  }
  if (!res.ok || json.status === "error") {
    const rawErr = json.error;
    const code = typeof rawErr === "string" ? rawErr : (rawErr?.code ?? `http-${res.status}`);
    const errText = (json as Record<string, unknown>).text as string | undefined;

    if (
      code === "error.api.auth.jwt.missing" ||
      code === "error.api.auth.key.invalid" ||
      res.status === 401 ||
      res.status === 403
    ) {
      throw new Error(`Downloader service requires authentication (${code}).`);
    }
    if (errText?.includes("shut down") || errText?.includes("cobalt v7")) {
      throw new Error(`Downloader legacy API shut down.`);
    }

    const svc = /twitch/i.test(sourceUrl) ? "Twitch" : "YouTube";
    throw new Error(
      `Could not download this ${svc} link (${code}). It may be private, age-restricted, live, or region-locked.`
    );
  }
  if (
    (json.status === "tunnel" || json.status === "redirect") &&
    typeof json.url === "string" &&
    /^https?:\/\//i.test(json.url)
  )
    return { directUrl: json.url, filename: json.filename ?? null, service: json.service ?? null };
  if (json.status === "picker" && Array.isArray(json.picker)) {
    const vid =
      json.picker.find((p) => p?.type === "video" && /^https?:\/\//i.test(p.url ?? "")) ??
      json.picker.find((p) => /^https?:\/\//i.test(p.url ?? ""));
    if (vid?.url) return { directUrl: vid.url, filename: json.filename ?? null, service: json.service ?? null };
  }
  if (
    typeof json.url === "string" &&
    /^https?:\/\//i.test(json.url) &&
    (!json.status || /success|stream|redirect|tunnel/i.test(json.status))
  )
    return { directUrl: json.url, filename: json.filename ?? null, service: json.service ?? null };
  if (!json.status && !json.url) return null;
  throw new Error(`Downloader returned "${json.status ?? "unknown"}" with no playable URL.`);
}

export async function resolveWatchPageToDirectUrl(sourceUrl: string): Promise<ResolvedDirectVideo> {
  const endpoint = cobaltEndpoint();
  const hasCustomCobalt = endpoint && !endpoint.includes("api.cobalt.tools");

  // 1. If custom self-hosted Cobalt instance is configured, try it first
  if (hasCustomCobalt) {
    try {
      const r = await tryCobaltOnce(
        endpoint,
        { url: sourceUrl, videoQuality: "720", downloadMode: "auto", filenameStyle: "basic" },
        sourceUrl
      );
      if (r) return r;
    } catch (err) {
      console.warn("[video-download] custom Cobalt failed, trying yt-dlp:", (err as Error).message);
    }
  }

  // 2. Try yt-dlp (fast and works reliably on local dev and environments with python/yt-dlp)
  try {
    const ytRes = await resolveWatchPageWithYtDlp(sourceUrl);
    if (ytRes) return ytRes;
  } catch (err) {
    console.warn("[video-download] yt-dlp extraction failed:", (err as Error).message);
  }

  // 3. If Cobalt endpoint was provided (e.g. api.cobalt.tools or other), attempt Cobalt as fallback
  if (endpoint) {
    const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
      { url: endpoint, body: { url: sourceUrl, videoQuality: "720", downloadMode: "auto", filenameStyle: "basic" } },
    ];
    if (!endpoint.includes("api.cobalt.tools") && !/\/api\/json$/i.test(endpoint)) {
      attempts.push({ url: `${endpoint}/api/json`, body: { url: sourceUrl } });
    }
    let lastErr = "";
    for (const a of attempts) {
      try {
        const r = await tryCobaltOnce(a.url, a.body, sourceUrl);
        if (r) return r;
      } catch (err) {
        lastErr = (err as Error).message;
        if (lastErr.includes("authentication") || lastErr.includes("api.cobalt.tools")) {
          throw err;
        }
      }
    }
    if (lastErr) throw new Error(lastErr);
  }

  throw new Error(
    "Could not download this link. The video may be private, age-restricted, or unsupported. Try uploading the video file directly."
  );
}

export async function downloadWatchPageToStorj(
  sourceUrl: string,
  destKey: string,
  opts?: { contentType?: string; metadata?: Record<string, string> }
) {
  let resolved: ResolvedDirectVideo | null = null;
  try {
    resolved = await resolveWatchPageToDirectUrl(sourceUrl);
  } catch (err) {
    console.warn("[video-download] direct URL resolution failed, checking temp file fallback:", (err as Error).message);
  }

  // If we have a direct stream URL that is not an HLS playlist (.m3u8), stream it straight into Storj
  if (resolved?.directUrl && !/\.m3u8($|\?)/i.test(resolved.directUrl)) {
    try {
      return await uploadVideoFromUrl(resolved.directUrl, destKey, {
        contentType: opts?.contentType || "video/mp4",
        metadata: opts?.metadata,
      });
    } catch (err) {
      console.warn("[video-download] direct stream upload failed, falling back to temp file:", (err as Error).message);
    }
  }

  // Fallback: download via yt-dlp to a temp file, then upload to Storj
  const tmpFile = path.join(os.tmpdir(), `dl-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  try {
    await downloadWithYtDlpToFile(sourceUrl, tmpFile);
    const stat = await fs.promises.stat(tmpFile);
    if (!stat.size) throw new Error("Downloaded video file is empty.");
    const fileStream = fs.createReadStream(tmpFile);
    const put = await putVideoObject({
      key: destKey,
      body: fileStream,
      contentType: opts?.contentType || "video/mp4",
      contentLength: stat.size,
      metadata: opts?.metadata,
    });
    const head = await headObject(destKey).catch(() => ({ size: null, contentType: null }));
    return {
      ...put,
      sizeBytes: head.size ?? stat.size,
      storedContentType: head.contentType ?? (opts?.contentType || "video/mp4"),
    };
  } finally {
    fs.promises.unlink(tmpFile).catch(() => {});
  }
}
