/**
 * Shorts generation config — single place to tune how many viral moments
 * Gemini picks from each long video.
 *
 * Change `count` (or set SHORTS_COUNT env) to generate more/fewer shorts
 * without touching the Inngest function. Clips are clamped to
 * [minSeconds, maxSeconds] (default 30–90s per requirements).
 */
export const SHORTS_CONFIG = {
  /** How many short candidates to generate per long video (default 5). */
  count: Math.min(
    10,
    Math.max(1, Number(process.env.SHORTS_COUNT ?? 5) || 5),
  ),
  /** Minimum short length in seconds. */
  minSeconds: Number(process.env.SHORTS_MIN_SECONDS ?? 30) || 30,
  /** Maximum short length in seconds. */
  maxSeconds: Number(process.env.SHORTS_MAX_SECONDS ?? 90) || 90,
  /** Gemini model used for viral-moment selection. */
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  /**
   * Max transcript characters sent to Gemini. Long videos are truncated
   * from the middle-out (keeps hook + payoff) so the prompt stays in limits.
   */
  maxTranscriptChars: Number(process.env.SHORTS_TRANSCRIPT_CHARS ?? 12000) || 12000,
} as const;

export type ShortsConfig = typeof SHORTS_CONFIG;
