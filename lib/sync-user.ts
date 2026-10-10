import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  ensureProjectsSchema,
  isSchemaNotReadyError,
} from "@/lib/ensure-schema";

/**
 * Sync the signed-in Clerk user into Neon.
 *
 * Called on every visit to an authenticated surface (NOT via webhooks):
 * - inserts the row on first sign-up,
 * - refreshes name / email / avatar on later visits,
 * - no-ops when signed out or DATABASE_URL is missing (dev without DB).
 *
 * Never throws — auth pages and the dashboard must render even if Neon is
 * unreachable.
 *
 * On a fresh production DB (Vercel) the `users` table may not exist yet
 * (`[42P01] relation "users" does not exist`) — self-heal once
 * (idempotent CREATE TABLEs) and retry so the first visit creates both the
 * schema and the user row.
 */
export async function syncCurrentUserToDb() {
  const user = await currentUser();
  if (!user) return null;

  try {
    const db = getDb();
    const email = user.primaryEmailAddress?.emailAddress ?? null;

    const upsert = () =>
      db
        .insert(users)
        .values({
          id: user.id,
          email,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email,
            firstName: user.firstName,
            lastName: user.lastName,
            imageUrl: user.imageUrl,
            updatedAt: new Date(),
          },
        })
        .returning();

    try {
      const rows = await upsert();
      return rows[0] ?? null;
    } catch (error) {
      if (!isSchemaNotReadyError(error)) throw error;
      console.warn(
        "[sync-user] schema not ready (fresh/stale DB), self-healing:",
        (error as Error).message?.slice(0, 300),
      );
      await ensureProjectsSchema();
      const rows = await upsert();
      return rows[0] ?? null;
    }
  } catch (error) {
    // Missing DATABASE_URL in local dev, or a transient Neon outage:
    // log and let the page render anyway.
    console.warn("[sync-user] skipping DB sync:", (error as Error).message);
    return null;
  }
}
