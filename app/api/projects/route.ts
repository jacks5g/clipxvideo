import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects, users } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { inngest } from "@/inngest/client";
import { and, asc, count, eq, gte } from "drizzle-orm";
import {
  ajUpload,
  denialKind,
  isArcjetConfigured,
  resetInSeconds,
} from "@/lib/arcjet";
import {
  DAILY_UPLOAD_LIMIT,
  msUntilReset,
  quotaExceeded,
  remainingUploads,
  windowStart,
} from "@/lib/upload-quota";

/**
 * POST /api/projects
 * Creates a NEW project row per video upload, then fires the Inngest
 * `video/upload.requested` event which runs the `prepare-storj-upload`
 * step (S3 key + presigned URL) and updates the row to `uploading`.
 *
 * Protection (Arcjet):
 * - Shield (WAF) + bot block on every call.
 * - Per-user fixed-window rate limit: 17 uploads / 24h, resets daily.
 * - DB daily-count check ALWAYS runs as the hard fallback (works even
 *   when ARCJET_KEY is missing or Arcjet is unreachable).
 *
 * Body: { title?, fileName, mimeType?, sizeBytes?, sourceUrl?, sourceKind? }
 * Returns: { project: { id, status, progress } }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // --- Arcjet: Shield + bot + 17/day per-user rate limit -----------------
  if (isArcjetConfigured()) {
    try {
      const decision = await ajUpload.protect(req, { userId });
      if (decision.isDenied()) {
        const kind = denialKind(decision);
        const retryAfter = resetInSeconds(decision);
        console.warn(`[projects] arcjet denied upload (${kind}) user=${userId}`);
        if (decision.reason.isRateLimit()) {
          return NextResponse.json(
            {
              error: `Daily upload limit reached — you can upload ${DAILY_UPLOAD_LIMIT} videos per day. Try again tomorrow.`,
              code: "DAILY_LIMIT",
              limit: DAILY_UPLOAD_LIMIT,
              retryAfterSeconds: retryAfter || undefined,
            },
            {
              status: 429,
              headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
            },
          );
        }
        if (decision.reason.isBot()) {
          return NextResponse.json(
            { error: "Automated uploads are not allowed", code: "BOT_BLOCKED" },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { error: "Request blocked by security policy", code: "SHIELD_BLOCKED" },
          { status: 403 },
        );
      }
    } catch (err) {
      // Fail open — DB quota check below is the hard enforcement.
      console.warn("[projects] arcjet error (fail open):", (err as Error)?.message);
    }
  }

  let body: {
    title?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    sourceUrl?: string;
    sourceKind?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fileName = (body.fileName ?? "upload.mp4").slice(0, 255);
  const mimeType = body.mimeType ?? "video/mp4";
  if (!mimeType.startsWith("video/")) {
    return NextResponse.json({ error: "Only video/* mime types are supported" }, { status: 400 });
  }

  const projectId = `prj_${crypto.randomUUID()}`;
  const title = (body.title ?? fileName.replace(/\.[a-z0-9]+$/i, "") ?? "Untitled video").slice(0, 255);

  // Link imports (YouTube/Twitch) carry no bytes — omit the bigint column
  // entirely so Drizzle/Neon sends DEFAULT (NULL) instead of an explicit
  // null/empty-string param that Postgres rejects as
  // `invalid input syntax for type bigint: ""`.
  const sizeBytes =
    typeof body.sizeBytes === "number" &&
    Number.isFinite(body.sizeBytes) &&
    body.sizeBytes >= 0
      ? Math.floor(body.sizeBytes)
      : undefined;

  // Empty strings violate nothing but pollute the DB — normalize to NULL.
  const rawSourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const sourceUrl = rawSourceUrl ? rawSourceUrl.slice(0, 2048) : null;
  const rawSourceKind = typeof body.sourceKind === "string" ? body.sourceKind.trim() : "";
  const sourceKind = rawSourceKind ? rawSourceKind.slice(0, 64) : null;

  try {
    const db = getDb();

    // Guarantee the FK target exists. Dashboard layout upserts the user via
    // syncCurrentUserToDb(), but that helper swallows errors (dev without DB,
    // transient Neon outage) — so a first-visit link import can otherwise die
    // with `violates foreign key constraint "projects_user_id_fkey"`.
    // Minimal insert + DoNothing keeps this safe under concurrency; the layout
    // sync backfills email/name/avatar on the next visit.
    //
    // Fresh production DBs (Vercel) have NO tables at all — the very first
    // upload then dies here with `[42P01] relation "users" does not exist`.
    // Self-heal (idempotent CREATE TABLE IF NOT EXISTS) and retry once so
    // the upload succeeds instead of surfacing "Upload failed [42P01]".
    try {
      await db.insert(users).values({ id: userId }).onConflictDoNothing();
    } catch (userErr) {
      if (!isMissingColumnError(userErr)) throw userErr;
      console.warn(
        "[projects] schema not ready (fresh/stale DB), self-healing then retrying user insert:",
        (userErr as Error)?.message?.slice(0, 300),
      );
      await ensureProjectsSchema();
      await db.insert(users).values({ id: userId }).onConflictDoNothing();
    }

    // --- Hard daily quota (ALWAYS runs — Arcjet-independent) ---------------
    // 17 uploads per rolling 24h; resets next day automatically.
    try {
      const since = windowStart();
      const cnt = await db
        .select({ n: count() })
        .from(projects)
        .where(and(eq(projects.userId, userId), gte(projects.createdAt, since)));
      const used = Number(cnt[0]?.n ?? 0);
      if (quotaExceeded(used)) {
        console.warn(`[projects] daily quota hit user=${userId} used=${used}`);
        // Oldest upload in window → precise Retry-After.
        const oldestRows = await db
          .select({ createdAt: projects.createdAt })
          .from(projects)
          .where(and(eq(projects.userId, userId), gte(projects.createdAt, since)))
          .orderBy(asc(projects.createdAt))
          .limit(1);
        const retryMs = msUntilReset(oldestRows[0]?.createdAt ?? null);
        const retrySec = Math.max(1, Math.ceil(retryMs / 1000));
        return NextResponse.json(
          {
            error: `Daily upload limit reached — you can upload ${DAILY_UPLOAD_LIMIT} videos per day. Resets tomorrow.`,
            code: "DAILY_LIMIT",
            limit: DAILY_UPLOAD_LIMIT,
            used,
            remaining: remainingUploads(used),
            retryAfterSeconds: retrySec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(retrySec) },
          },
        );
      }
    } catch (quotaErr) {
      // Quota-check failure must not block uploads outright unless it's the
      // intentional 429 above (which already returned). Log + continue.
      const msg = (quotaErr as Error)?.message ?? "";
      if (/DAILY_LIMIT/.test(msg)) throw quotaErr;
      console.warn("[projects] quota check failed (continuing):", msg.slice(0, 300));
    }

    // Full row first; if Neon is behind the code (e.g. `source_url` /
    // `source_kind` not yet pushed), fall back to the core columns so the
    // upload isn't blocked by a stale DB. The narrowed catch below then
    // returns the FULL Postgres reason (code/detail/cause) instead of the
    // truncated "Failed query: insert into ..." prefix the UI used to show.
    try {
      await db.insert(projects).values({
        id: projectId,
        userId,
        title,
        fileName,
        mimeType,
        // `undefined` => column omitted => SQL DEFAULT (NULL). Never send "".
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        status: "requesting_upload",
        progress: 5,
        sourceUrl,
        sourceKind,
      });
    } catch (insertErr) {
      const msg = (insertErr as Error)?.message ?? "";
      // Missing-column (undefined_column) or wrong-schema: self-heal the
      // live DB (idempotent ADD COLUMN IF NOT EXISTS) and retry the FULL
      // insert once — this is exactly the `[42703] column
      // "transcript_words_json" of relation "projects" does not exist`
      // crash. Minimal-insert fallback kept as last resort.
      if (isMissingColumnError(insertErr)) {
        try {
          console.warn("[projects] stale DB schema, self-healing then retrying full insert:", msg.slice(0, 300));
          await ensureProjectsSchema();
          await db.insert(projects).values({
            id: projectId,
            userId,
            title,
            fileName,
            mimeType,
            ...(sizeBytes !== undefined ? { sizeBytes } : {}),
            status: "requesting_upload",
            progress: 5,
            sourceUrl,
            sourceKind,
          });
        } catch (healErr) {
          console.warn("[projects] healed insert failed, retrying minimal:", (healErr as Error)?.message?.slice(0, 500));
          await db.insert(projects).values({
            id: projectId,
            userId,
            title,
            fileName,
            mimeType,
            status: "requesting_upload",
            progress: 5,
          });
        }
      } else {
        throw insertErr;
      }
    }

    // Execute the Inngest function — its prepare step flips the row to
    // `uploading`. Fire-and-forget: UI polls status separately.
    // In local dev without an Inngest dev server, this throws — fall back to
    // preparing inline so upload still works.
    try {
      await inngest.send({
        name: "video/upload.requested",
        data: {
          projectId,
          userId,
          fileName,
          mimeType,
          sizeBytes: sizeBytes ?? 0,
          sourceUrl,
          sourceKind,
        },
      });
    } catch (sendErr) {
      console.warn("[projects] inngest.send failed, preparing inline:", (sendErr as Error).message);
      const { buildStorageKey } = await import("@/lib/storj");
      const { eq } = await import("drizzle-orm");
      await db
        .update(projects)
        .set({
          storageKey: buildStorageKey(userId, projectId, fileName),
          bucket: process.env.STORJ_BUCKET ?? null,
          status: "uploading",
          progress: 10,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    }

    return NextResponse.json({ project: { id: projectId, status: "requesting_upload", progress: 5 } });
  } catch (err) {
    // Neon/Drizzle errors stringify as "Failed query: insert into ..." with
    // the REAL Postgres reason buried in `cause`. Unwrap it so the UI (and
    // the server log) show e.g. `column "source_url" does not exist` or the
    // FK / NOT NULL violation instead of the truncated query prefix.
    const e = err as Error & { cause?: unknown; code?: string; detail?: string };
    const cause = e.cause as (Error & { code?: string; detail?: string; message?: string }) | undefined;
    const reason =
      cause?.detail ??
      cause?.message ??
      (typeof e.cause === "string" ? e.cause : undefined) ??
      e.detail ??
      e.message;
    const code = cause?.code ?? e.code;
    console.error("[projects] insert failed:", code ? `[${code}] ` : "", reason);
    return NextResponse.json(
      { error: code ? `[${code}] ${reason}` : reason, code },
      { status: 500 },
    );
  }
}
