import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

let cached: S3Client | null = null;
// Cache the env we built the client with — env changes (e.g. HMR) must
// rebuild the client instead of signing with stale credentials.
let cachedEnvKey = "";

export function storjEnv() {
  const bucket = process.env.STORJ_BUCKET;
  const endpoint = process.env.STORJ_ENDPOINT;
  const accessKeyId = process.env.STORJ_ACCESS_KEY;
  const secretAccessKey = process.env.STORJ_SECRET_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storj S3 env missing. Set STORJ_BUCKET, STORJ_ENDPOINT, STORJ_ACCESS_KEY, STORJ_SECRET_KEY in .env.local (see .env.example)."
    );
  }
  return { bucket, endpoint, accessKeyId, secretAccessKey };
}

export function getS3() {
  const { bucket, endpoint, accessKeyId, secretAccessKey } = storjEnv();
  const envKey = [bucket, endpoint, accessKeyId].join("|");
  if (cached && cachedEnvKey === envKey) return cached;
  cachedEnvKey = envKey;
  cached = new S3Client({
    region: "us-east-1", // Storj ignores region but SDK requires one
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return cached;
}

export function buildStorageKey(userId: string, projectId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "video";
  return `${userId}/${projectId}/original-${Date.now()}-${safe}`;
}

/** Short-lived PUT URL the browser uses to upload bytes straight to Storj. */
export async function createUploadUrl(opts: { key: string; contentType: string; expiresIn?: number }) {
  const s3 = getS3();
  const { bucket } = storjEnv();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType || "video/mp4",
  });
  return getSignedUrl(s3, cmd, { expiresIn: opts.expiresIn ?? 3600 });
}

/** Long-lived GET URL returned to the UI so the user can view the upload. */
export async function createPlaybackUrl(key: string, expiresIn = 7 * 24 * 3600) {
  const s3 = getS3();
  const { bucket } = storjEnv();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

export async function headObject(key: string) {
  const s3 = getS3();
  const { bucket } = storjEnv();
  const out = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { size: out.ContentLength ?? null, contentType: out.ContentType ?? null };
}

/**
 * Path-style public URL for an object, e.g.
 * `https://gateway.storjshare.io/<bucket>/<key>`.
 * Only streams without auth when the bucket/object is public (or Link
 * Sharing is enabled). Otherwise use createPlaybackUrl (signed GET).
 * Override the base with STORJ_PUBLIC_URL for custom domains / Link Sharing.
 */
export function getPublicObjectUrl(key: string) {
  const { bucket, endpoint } = storjEnv();
  const base = (process.env.STORJ_PUBLIC_URL ?? endpoint).replace(/\/+$/, "");
  const cleanKey = key
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${bucket}/${cleanKey}`;
}

/**
 * Preferred playable URL for a stored video. Returns the stable public URL
 * when STORJ_PUBLIC_URL is set, else a signed GET URL (default 7 days).
 */
export async function getActualVideoUrl(key: string, opts?: { expiresIn?: number }) {
  if (process.env.STORJ_PUBLIC_URL) return getPublicObjectUrl(key);
  return createPlaybackUrl(key, opts?.expiresIn ?? 7 * 24 * 3600);
}

type PutBody = Uint8Array | Buffer | string | Readable | Blob;

/** Real server-side PUT to the Storj S3 bucket. Returns actual object location + playable URL. */
export async function putVideoObject(opts: {
  key: string;
  body: PutBody;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}) {
  const s3 = getS3();
  const { bucket } = storjEnv();
  const contentType = opts.contentType || "video/mp4";
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body as never,
      ContentType: contentType,
      ...(typeof opts.contentLength === "number" && Number.isFinite(opts.contentLength)
        ? { ContentLength: Math.floor(opts.contentLength) }
        : {}),
      ...(opts.metadata ? { Metadata: opts.metadata } : {}),
    })
  );
  const playbackUrl = await getActualVideoUrl(opts.key);
  return {
    bucket,
    key: opts.key,
    contentType,
    sizeBytes: opts.contentLength ?? null as number | null,
    objectUrl: getPublicObjectUrl(opts.key),
    playbackUrl,
  };
}

/** Convenience wrapper for Buffer / Uint8Array uploads (tests, small clips). */
export async function uploadVideoBuffer(
  key: string,
  data: Uint8Array | Buffer | Blob,
  contentType = "video/mp4"
) {
  const length =
    typeof (data as Blob).size === "number"
      ? (data as Blob).size
      : ((data as Uint8Array).byteLength ?? undefined);
  return putVideoObject({ key, body: data as PutBody, contentType, contentLength: length });
}

/**
 * True for YouTube / Twitch watch pages (and clips/channel pages) which
 * return HTML, not video bytes. These can never be fetched server-side via
 * plain `fetch()` — they need a download/extraction service. Direct file
 * URLs (cdn.example.com/clip.mp4) return video/* and ARE downloadable.
 */
export function isWatchPageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const isYouTube =
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host.endsWith(".youtu.be") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com");
    const isTwitch = host === "twitch.tv" || host.endsWith(".twitch.tv");
    return isYouTube || isTwitch;
  } catch {
    return false;
  }
}

/** Fetches a remote video and streams it straight into Storj. No full-file buffering. */
export async function uploadVideoFromUrl(
  sourceUrl: string,
  destKey: string,
  opts?: { contentType?: string; metadata?: Record<string, string> }
) {
  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new Error(`uploadVideoFromUrl: only http(s) sourceUrl is supported (got ${sourceUrl})`);
  }
  // Fast-fail watch pages before fetching: they always return HTML.
  if (isWatchPageUrl(sourceUrl)) {
    throw new Error(
      `Source URL is a YouTube/Twitch watch page, not a direct video file. ` +
        `Only direct video file URLs (e.g. https://cdn.example.com/clip.mp4) can be uploaded ` +
        `server-side — YouTube/Twitch watch pages need a download service.`
    );
  }
  const res = await fetch(sourceUrl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to fetch source video (${res.status} ${res.statusText}) from ${sourceUrl}`);
  }
  if (!res.body) throw new Error(`Source response has no body: ${sourceUrl}`);
  const remoteType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
  // Guard: YouTube/Twitch watch pages return HTML, not video bytes. Refuse to
  // store non-video responses as if they were video.
  if (
    remoteType &&
    !remoteType.startsWith("video/") &&
    remoteType !== "application/octet-stream" &&
    remoteType !== "binary/octet-stream"
  ) {
    throw new Error(
      `Source URL did not return video bytes (got Content-Type: ${remoteType || "unknown"}). ` +
        `Only direct video file URLs (e.g. https://cdn.example.com/clip.mp4) can be uploaded ` +
        `server-side — YouTube/Twitch watch pages need a download service.`
    );
  }
  const contentType = remoteType.startsWith("video/") ? remoteType : opts?.contentType || "video/mp4";
  const parsedLen = Number.parseInt(res.headers.get("content-length") ?? "", 10);
  const contentLength = Number.isFinite(parsedLen) ? parsedLen : undefined;
  const bodyStream = Readable.fromWeb(res.body as never);
  const put = await putVideoObject({
    key: destKey,
    body: bodyStream,
    contentType,
    contentLength,
    metadata: opts?.metadata,
  });
  const head = await headObject(destKey).catch(() => ({ size: null, contentType: null }));
  return {
    ...put,
    sizeBytes: head.size ?? contentLength ?? null,
    storedContentType: head.contentType ?? contentType,
  };
}
