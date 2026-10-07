import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import {
  ajAi,
  denialKind,
  isArcjetConfigured,
  resetInSeconds,
} from "@/lib/arcjet";
import { detectPromptInjection } from "@arcjet/next";

/**
 * POST /api/projects/:id/analyze — fires `video/analysis.requested` so the
 * `analyze-video-transcribe` Inngest function transcribes the uploaded video
 * via Deepgram + generates SRT/VTT captions. UI then navigates to
 * /dashboard/projects/:id which polls progress step-by-step.
 *
 * Protection (Arcjet AI endpoint abuse + prompt injection):
 * - Shield (WAF) + block all bots — AI calls cost money, bots get nothing.
 * - slidingWindow burst cap (20 / 10m per user).
 * - sensitiveInfo deny (EMAIL / PHONE / CREDIT_CARD) — PII never reaches
 *   Deepgram/Gemini or the transcript tables.
 * - detectPromptInjection on the user-controlled `title` (the only free-text
 *   input that flows into the Gemini viral-moment prompt builder).
 *   Injection-looking titles are rejected BEFORE the Inngest event fires,
 *   protecting AI behavior + budget.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  // Read the free-text title early — it's the prompt-injection surface
  // (it flows into Gemini via buildPrompt in lib/gemini-shorts.ts).
  let requestedTitle = "";
  try {
    const clone = req.clone();
    const maybeBody = (await clone.json().catch(() => null)) as {
      title?: unknown;
    } | null;
    if (typeof maybeBody?.title === "string") {
      requestedTitle = maybeBody.title.slice(0, 500);
    }
  } catch {
    // No JSON body — analyze routes normally POST with empty body.
  }

  // --- Arcjet AI abuse protection ---------------------------------------
  if (isArcjetConfigured()) {
    try {
      const decision = await ajAi.protect(req, { userId, sensitiveInfoValue: requestedTitle || undefined });
      if (decision.isDenied()) {
        const kind = denialKind(decision);
        console.warn(`[analyze] arcjet denied (${kind}) user=${userId} project=${id}`);
        if (decision.reason.isRateLimit()) {
          const retryAfter = resetInSeconds(decision);
          return NextResponse.json(
            {
              error:
                "Too many analysis requests — please wait a few minutes before retrying.",
              code: "AI_RATE_LIMIT",
              retryAfterSeconds: retryAfter || undefined,
            },
            {
              status: 429,
              headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
            },
          );
        }
        return NextResponse.json(
          {
            error:
              kind === "sensitive-info"
                ? "Request contains sensitive data that can't be sent to AI processing"
                : "Request blocked by AI abuse protection",
            code: kind === "sensitive-info" ? "SENSITIVE_INFO" : "AI_ABUSE_BLOCKED",
          },
          { status: 403 },
        );
      }
    } catch (err) {
      console.warn("[analyze] arcjet error (fail open):", (err as Error)?.message);
    }

    // --- Prompt injection detection on user-controlled title -------------
    // Arcjet ML check FIRST (its verdict actually blocks), heuristic second.
    if (requestedTitle.trim()) {
      let blockedByArcjet = false;
      try {
        const pi = await ajAi
          .withRule(
            detectPromptInjection({
              mode: "LIVE",
            }),
          )
          .protect(req, { userId, detectPromptInjectionMessage: requestedTitle });
        if (pi.isDenied()) {
          blockedByArcjet = true;
          console.warn(
            `[analyze] arcjet prompt-injection denied user=${userId} project=${id}`,
          );
        }
      } catch (err) {
        console.warn("[analyze] prompt-injection check error (fail open):", (err as Error)?.message);
      }
      // Heuristic backstop (always runs, no network): common jailbreak /
      // instruction-override patterns in the title are rejected before
      // Gemini ever sees them.
      if (
        blockedByArcjet ||
        looksLikePromptInjection(requestedTitle)
      ) {
        if (!blockedByArcjet) {
          console.warn(`[analyze] prompt-injection heuristic hit user=${userId} project=${id}`);
        }
        return NextResponse.json(
          {
            error:
              "Title looks like a prompt-injection attempt and was blocked to protect AI processing. Use a plain video title.",
            code: "PROMPT_INJECTION",
          },
          { status: 403 },
        );
      }
    }
  } else if (requestedTitle.trim() && looksLikePromptInjection(requestedTitle)) {
    // No ARCJET_KEY — heuristic still protects the Gemini prompt.
    return NextResponse.json(
      {
        error:
          "Title looks like a prompt-injection attempt and was blocked to protect AI processing. Use a plain video title.",
        code: "PROMPT_INJECTION",
      },
      { status: 403 },
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  const project = rows[0];
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.storageKey && project.sourceUrl) {
    // Link import still downloading into Storj — analysis needs stored bytes.
    return NextResponse.json(
      { error: "Video link is still downloading to storage — wait for upload to finish, then retry analysis" },
      { status: 409 },
    );
  }
  if (project.sourceUrl && project.status !== "ready") {
    // Download landed a storageKey but bytes aren't verified yet (status is
    // uploading/processing from the download step) — don't Deepgram a stub.
    return NextResponse.json(
      { error: `Video link download is ${project.status} — wait for it to finish, then retry analysis` },
      { status: 409 },
    );
  }
  if (!project.storageKey && !project.sourceUrl) {
    return NextResponse.json(
      { error: "Upload the video before running AI analysis" },
      { status: 400 },
    );
  }

  await db
    .update(projects)
    .set({ status: "processing", progress: 5, error: null, updatedAt: new Date() })
    .where(eq(projects.id, id));

  try {
    await inngest.send({
      name: "video/analysis.requested",
      data: { projectId: id, userId },
    });
    return NextResponse.json({ ok: true, via: "inngest", projectId: id });
  } catch (sendErr) {
    console.warn("[analyze] inngest.send failed:", (sendErr as Error).message);
    return NextResponse.json(
      {
        error:
          "Analysis queue is unreachable — start the Inngest dev server (`npx inngest-cli@latest dev`) and retry.",
      },
      { status: 502 },
    );
  }
}

/**
 * Heuristic prompt-injection screen for user-controlled text that flows
 * into the Gemini viral-moment prompt (video titles).
 *
 * Arcjet's `detectPromptInjection` is the primary (ML) check above; this
 * regex backstop always runs locally with zero latency/cost and catches
 * the classic jailbreak / instruction-override shapes:
 *   "ignore previous instructions", "you are now DAN", "system:",
 *   "[INST]", "jailbreak", base64-ish instruction blobs, etc.
 */
function looksLikePromptInjection(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directives)/,
    /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/,
    /\bdan\b.*\b(jailbreak|unrestricted|unfiltered)\b/,
    /\bjailbreak\b/,
    /you\s+are\s+now\s+(dan|evil|unrestricted|unfiltered|a\s+hacker)/,
    /pretend\s+(you('re| are)|to\s+be)\s+(dan|evil|unrestricted|unfiltered|a\s+hacker|an?\s+ai\s+without)/,
    /act\s+as\s+(if\s+you\s+(are|were)\s+)?(dan|evil|unrestricted|unfiltered|a\s+hacker)/,
    /new\s+(system|developer)\s+(prompt|instructions|message|role)\s*:/,
    /^\s*(system|assistant|developer)\s*:/m,
    /\[inst\]/,
    /<<sys>>/,
    /override\s+(your|the)\s+(system\s+)?(prompt|instructions|rules|safety)/,
    /bypass\s+(your|the)\s+(safety|filters|guidelines|restrictions)/,
    /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions|api\s*key|secret)/,
    /output\s+(your|the)\s+(system\s+)?(prompt|instructions)/,
  ];
  return patterns.some((re) => re.test(t));
}
