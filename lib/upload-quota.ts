/**
 * Daily upload quota — hard enforcement that ALWAYS runs, even when
 * Arcjet is unconfigured or unreachable.
 *
 * Rule: each user may create at most DAILY_UPLOAD_LIMIT projects per
 * rolling 24h window (resets next day). Rolling window (now - 24h) means
 * no cron/reset job is needed — counts naturally decay.
 */

export const DAILY_UPLOAD_LIMIT = 17;
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Start of the current rolling 24h window. */
export function windowStart(): Date {
  return new Date(Date.now() - DAILY_WINDOW_MS);
}

/** True when `used` uploads already hits the daily cap. */
export function quotaExceeded(used: number): boolean {
  return used >= DAILY_UPLOAD_LIMIT;
}

export function remainingUploads(used: number): number {
  return Math.max(0, DAILY_UPLOAD_LIMIT - used);
}

/** Milliseconds until the oldest upload in the window ages out. */
export function msUntilReset(oldestInWindow: Date | null): number {
  if (!oldestInWindow) return 0;
  return Math.max(
    0,
    oldestInWindow.getTime() + DAILY_WINDOW_MS - Date.now(),
  );
}

