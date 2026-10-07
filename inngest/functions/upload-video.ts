import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { eq } from "drizzle-orm";
import {
  buildStorageKey,
  createUploadUrl,
  getActualVideoUrl,
  getPublicObjectUrl,
  headObject,
  isWatchPageUrl,
  storjEnv,
  uploadVideoFromUrl,
} from "@/lib/storj";
import { downloadWatchPageToStorj } from "@/lib/video-download";

type UploadRequestedData = {
  projectId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceUrl?: string;
  sourceKind?: string;
};

/**
 * Orchestrates the Storj upload for one project.
 *
 * Three paths — ALL end with real bytes in Storj:
 *
 *  1) Browser file flow (2GB-safe): step "prepare-storj-upload" mints the S3
 *     key + presigned PUT URL, DB -> uploading/10. Browser PUTs straight to
 *     Storj, then POSTs /complete which fires `video/upload.finalize`.
 *  2) Server-side flow (direct file sourceUrl): step "upload-video-to-storj"
 *     streams fetch(source) -> PutObject via uploadVideoFromUrl, DB -> ready.
 *  3) Link-import flow (YouTube/Twitch watch pages): step
 *     "download-link-to-storj" resolves the watch page to a direct MP4 via
 *     Cobalt (lib/video-download.ts) then streams it into Storj at the
 *     prepared key, DB -> ready with the REAL Storj playbackUrl. No more
 *     caption scraping, no more "has no captions" errors.
 *
 * UI polls GET /api/projects/:id for status/progress throughout.
 */
export const requestUpload = inngest.createFunction(
  {
    id: "prepare-storj-upload",
    retries: 2,
    triggers: [{ event: "video/upload.requested" }],
    // Link downloads that fail (Cobalt down, private video) would otherwise
    // leave the project at `uploading` forever — surface the reason.
    // NOTE: onFailure is itself an Inngest function — original event data
    // lives under event.data.event.data and side effects need step.run.
    onFailure: async ({ event, step, error }) => {
      const data = ((event?.data as { event?: { data?: Partial<UploadRequestedData> } })?.event?.data ?? {}) as Partial<UploadRequestedData>;
      const projectId = data.projectId ?? "";
      if (!projectId) return;
      const reason =
        (error as Error)?.message?.slice(0, 2000) || "Upload failed";
      await step.run("mark-upload-failed", async () => {
        const db = getDb();
        await db
          .update(projects)
          .set({ status: "failed", error: reason, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      });
    },
  },
  async ({ event, step }) => {
    const data = event.data as Partial<UploadRequestedData>;
    const projectId = data.projectId ?? "";
    const userId = data.userId ?? "";
    const fileName = data.fileName ?? "video.mp4";
    const mimeType = data.mimeType ?? "video/mp4";
    const rawSource = data.sourceUrl as unknown as string | null | undefined;
    const sourceUrl = (typeof rawSource === "string" ? rawSource.trim() : "") || undefined;
    const rawKind = data.sourceKind as unknown as string | null | undefined;
    const sourceKind = (typeof rawKind === "string" ? rawKind.trim().toLowerCase() : "") || undefined;
    if (!projectId || !userId) throw new Error("video/upload.requested missing projectId/userId");

    // Link imports (YouTube/Twitch watch pages) are DOWNLOADED server-side
    // via Cobalt -> direct MP4 -> Storj (lib/video-download.ts). They still
    // need a storageKey minted in the prepare step below.
    const isLinkImport =
      sourceKind === "youtube" ||
      sourceKind === "twitch" ||
      (sourceUrl ? isWatchPageUrl(sourceUrl) : false);

    const prepared = await step.run("prepare-storj-upload", async () => {
      const db = getDb();
      const { bucket } = storjEnv();
      const storageKey = buildStorageKey(userId, projectId, fileName || "video.mp4");
      // Link imports have no browser PUT — uploadUrl is null, but the key is
      // real so the download step can stream bytes straight into it.
      const uploadUrl = isLinkImport
        ? null
        : await createUploadUrl({ key: storageKey, contentType: mimeType || "video/mp4" });

      try {
        await db
          .update(projects)
          .set({ storageKey, bucket, status: "uploading", progress: 10, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      } catch (err) {
        // Stale DB vs code (e.g. transcript_words_json missing): heal once.
        // UPDATE without RETURNING only touches SET columns + the PK filter,
        // but the retry covers any schema drift.
        if (!isMissingColumnError(err)) throw err;
        console.warn("[prepare-storj-upload] stale DB schema, healing:", (err as Error).message.slice(0, 300));
        await ensureProjectsSchema();
        await db
          .update(projects)
          .set({ storageKey, bucket, status: "uploading", progress: 10, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      }

      return { projectId, storageKey, bucket, uploadUrl, sourceUrl: sourceUrl ?? null };
    });

    // Link imports: DOWNLOAD the watch page via Cobalt straight into Storj.
    // Then the project is fully uploaded (storageKey + playbackUrl set) and
    // the UI flips to done via polling — same as a finished browser upload.
    if (isLinkImport && sourceUrl) {
      if (!prepared.storageKey) throw new NonRetriableError("download-link-to-storj missing storageKey");
      const destKey: string = prepared.storageKey;
      const downloaded = await step.run("download-link-to-storj", async () => {
        const db = getDb();
        await db.update(projects).set({ status: "uploading", progress: 30, updatedAt: new Date() }).where(eq(projects.id, projectId));
        let put: Awaited<ReturnType<typeof downloadWatchPageToStorj>>;
        try {
          put = await downloadWatchPageToStorj(sourceUrl, destKey, { contentType: mimeType || "video/mp4", metadata: { projectId, userId } });
        } catch (err) {
          await db.update(projects).set({ status: "failed", error: (err as Error).message, updatedAt: new Date() }).where(eq(projects.id, projectId));
          throw new NonRetriableError((err as Error).message);
        }
        await db.update(projects).set({ storageKey: put.key, bucket: put.bucket,
          sizeBytes: put.sizeBytes ?? undefined, mimeType: put.storedContentType ?? put.contentType ?? undefined,
          playbackUrl: put.playbackUrl,
          playbackUrlExpiresAt: (process.env.STORJ_PUBLIC_URL ? null : new Date(Date.now() + 7 * 24 * 3600 * 1000)) as Date | null,
          status: "ready", progress: 100, error: null, updatedAt: new Date() }).where(eq(projects.id, projectId));
        return { projectId, bucket: put.bucket, storageKey: put.key, objectUrl: put.objectUrl, playbackUrl: put.playbackUrl, sizeBytes: put.sizeBytes };
      });
      return { ...prepared, linkImport: true, serverUpload: downloaded };
    }

    // ACTUAL server-side upload for direct http(s) file links (CDN/file host).
    // Browser file uploads skip this — browser already PUT the bytes.
    // Returns the ACTUAL bucket URL (objectUrl) + playable URL (playbackUrl).
    if (!isLinkImport && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      // Link imports early-returned above, so prepared.storageKey is a real
      // key here — guard anyway for type safety.
      if (!prepared.storageKey) throw new NonRetriableError("upload-video-to-storj missing storageKey");
      const destKey: string = prepared.storageKey;
      const uploaded = await step.run("upload-video-to-storj", async () => {
        const db = getDb();
        await db
          .update(projects)
          .set({ status: "uploading", progress: 40, updatedAt: new Date() })
          .where(eq(projects.id, projectId));

        // Real S3 upload: fetch(sourceUrl) -> stream -> PutObjectCommand(bucket, key).
        // Non-video responses fail here — surface them as project `failed`
        // (with the Content-Type reason) instead of retrying: a retry can
        // never turn an HTML page into video bytes, and Inngest retries would
        // otherwise overwrite the PATCH link-finalize `ready` status.
        let put: Awaited<ReturnType<typeof uploadVideoFromUrl>>;
        try {
          put = await uploadVideoFromUrl(sourceUrl, destKey, {
            contentType: mimeType || "video/mp4",
            metadata: { projectId, userId },
          });
        } catch (err) {
          await db
            .update(projects)
            .set({
              status: "failed",
              error: (err as Error).message,
              updatedAt: new Date(),
            })
            .where(eq(projects.id, projectId));
          throw new NonRetriableError((err as Error).message);
        }

        await db
          .update(projects)
          .set({
            storageKey: put.key,
            bucket: put.bucket,
            sizeBytes: put.sizeBytes ?? undefined,
            mimeType: put.storedContentType ?? put.contentType ?? undefined,
            playbackUrl: put.playbackUrl,
            playbackUrlExpiresAt: (process.env.STORJ_PUBLIC_URL
              ? null
              : new Date(Date.now() + 7 * 24 * 3600 * 1000)) as Date | null,
            status: "processing",
            progress: 85,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId));

        return {
          projectId,
          bucket: put.bucket,
          storageKey: put.key,
          // ACTUAL url of the video in the Storj S3 bucket (path-style).
          objectUrl: put.objectUrl,
          // Playable url for the UI (public bucket url, else signed GET).
          playbackUrl: put.playbackUrl,
          sizeBytes: put.sizeBytes,
        };
      });

      return { ...prepared, serverUpload: uploaded };
    }

    await step.run("mark-awaiting-bytes", async () => {
      const db = getDb();
      await db
        .update(projects)
        .set({ status: "uploading", progress: 15, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      return { projectId, awaitingClientPut: true };
    });

    return prepared;
  }
);

export const finalizeUpload = inngest.createFunction(
  {
    id: "finalize-storj-upload",
    retries: 2,
    triggers: [{ event: "video/upload.finalize" }],
  },
  async ({ event, step }) => {
    const data = event.data as Partial<{ projectId: string }>;
    const projectId = data.projectId ?? "";
    if (!projectId) throw new Error("video/upload.finalize missing projectId");
    return await step.run("finalize-storj-upload", async () => {
      const db = getDb();
      const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      const project = rows[0];
      if (!project) throw new Error(`Project ${projectId} not found`);
      if (!project.storageKey) throw new Error(`Project ${projectId} has no storageKey`);

      await db
        .update(projects)
        .set({ status: "processing", progress: 90, updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      // Verify the object ACTUALLY exists in the Storj S3 bucket, then mint
      // the real playable URL (public URL when STORJ_PUBLIC_URL is set, else
      // a signed GET URL) and persist it for the UI.
      const head = await headObject(project.storageKey);
      const playbackUrl = await getActualVideoUrl(project.storageKey);
      const objectUrl = getPublicObjectUrl(project.storageKey);
      // HeadObject returns nulls on some S3 gateways — Drizzle bigint/integer
      // columns need `undefined` (skip) instead of `null` writes here.
      const patch: Partial<typeof projects.$inferInsert> = {
        status: "ready",
        progress: 100,
        playbackUrl,
        playbackUrlExpiresAt: (process.env.STORJ_PUBLIC_URL
          ? null
          : new Date(Date.now() + 7 * 24 * 3600 * 1000)) as Date | null,
        error: null,
        updatedAt: new Date(),
      };
      if (head.size !== null) patch.sizeBytes = head.size;
      if (head.contentType !== null) patch.mimeType = head.contentType;

      await db.update(projects).set(patch).where(eq(projects.id, projectId));

      // Returned to the Inngest dashboard + run output — includes the ACTUAL
      // urls to view the uploaded video.
      return { projectId, objectUrl, playbackUrl, status: "ready" as const };
    });
  }
);

export const functions = [requestUpload, finalizeUpload];

