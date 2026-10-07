import arcjet, {
  detectBot,
  fixedWindow,
  shield,
  sensitiveInfo,
  slidingWindow,
} from "@arcjet/next";

/**
 * Central Arcjet setup for FastXClip.
 *
 * Requires ARCJET_KEY in .env.local (see .env.example).
 * Get a free key at https://app.arcjet.com → Sites → Add site.
 *
 * Design:
 * - `aj`       : base instance with Shield (WAF) only. Extended per-route
 *                with `.withRule(...)` so each endpoint gets exactly the
 *                rules it needs.
 * - `ajUpload` : POST /api/projects — Shield + bot block + per-user
 *                fixed-window 17 uploads / 24h (resets daily).
 * - `ajAi`     : POST /api/projects/:id/analyze — AI abuse protection
 *                (Shield + block all bots) + sensitive-info guard +
 *                per-10-minute burst limit so Gemini/Deepgram can't be
 *                abused as free compute. Prompt-injection rule is added
 *                per-request via `.withRule()` on the title path.
 * - `ajRead`   : lightweight read guard for polling/list routes.
 *
 * All helpers fail OPEN when ARCJET_KEY is missing (local dev without a
 * key) so uploads aren't blocked — the DB daily-count check in
 * POST /api/projects is the hard enforcement fallback.
 */

const key = process.env.ARCJET_KEY;

if (!key) {
  console.warn(
    "[arcjet] ARCJET_KEY is not set — Arcjet checks will fail open (allowed) until you add it to .env.local. DB daily-limit still enforced.",
  );
}

export const aj = arcjet({
  key: key ?? "ajkey_missing_fail_open",
  rules: [
    shield({
      // LIVE blocks attacks; use "DRY_RUN" while testing to log only.
      mode: "LIVE",
    }),
  ],
});

/** 17 video uploads per user per day — resets every 24h. */
export const ajUpload = arcjet({
  key: key ?? "ajkey_missing_fail_open",
  characteristics: ["userId"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      // Block every automated client on the paid upload path.
      // Good bots (search crawlers) never POST uploads.
      allow: [],
    }),
    fixedWindow({
      mode: "LIVE",
      // 24h window = "resets next day". 17 tokens per userId.
      window: "86400s",
      max: 17,
    }),
  ],
});

/** AI analysis endpoint — abuse + prompt-injection + PII guards. */
export const ajAi = arcjet({
  key: key ?? "ajkey_missing_fail_open",
  characteristics: ["userId"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({ mode: "LIVE", allow: [] }),
    // Burst guard so one user can't fan out analysis jobs.
    slidingWindow({ mode: "LIVE", interval: "10m", max: 20 }),
    sensitiveInfo({
      mode: "LIVE",
      // Block requests carrying obvious PII that would otherwise land
      // in Deepgram/Gemini context + DB transcripts.
      deny: ["EMAIL", "PHONE_NUMBER", "CREDIT_CARD_NUMBER"],
    }),
  ],
});

/** Cheap read guard for polling/list routes (bot + shield only). */
export const ajRead = arcjet({
  key: key ?? "ajkey_missing_fail_open",
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({ mode: "LIVE", allow: [] }),
  ],
});

export type ArcjetDecision = Awaited<ReturnType<typeof aj.protect>>;

/** True when ARCJET_KEY is set (otherwise we fail open in dev). */
export function isArcjetConfigured(): boolean {
  return Boolean(key);
}

/** True when the denial was a rate-limit (for 429 vs 403 mapping). */
export function isRateLimitDenial(decision: ArcjetDecision): boolean {
  try {
    return decision.reason.isRateLimit();
  } catch {
    return false;
  }
}

/** Human-readable denial kind for logs / API errors. */
export function denialKind(decision: ArcjetDecision): string {
  try {
    const reason = decision.reason as unknown as {
      isBot?: () => boolean;
      isShield?: () => boolean;
      isRateLimit?: () => boolean;
      isSensitiveInfo?: () => boolean;
      isPromptInjection?: () => boolean;
    };
    if (reason.isRateLimit?.()) return "rate-limit";
    if (reason.isBot?.()) return "bot";
    if (reason.isShield?.()) return "shield";
    if (reason.isSensitiveInfo?.()) return "sensitive-info";
    if (reason.isPromptInjection?.()) return "prompt-injection";
    return "denied";
  } catch {
    return "denied";
  }
}

/**
 * Seconds until the Arcjet quota resets (for Retry-After headers).
 * Returns 0 when unknown.
 */
export function resetInSeconds(decision: ArcjetDecision): number {
  try {
    const ttl = (decision as unknown as { ttl?: number }).ttl;
    return typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0
      ? Math.ceil(ttl)
      : 0;
  } catch {
    return 0;
  }
}
