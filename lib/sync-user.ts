import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";

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
 */
export async function syncCurrentUserToDb() {
  const user = await currentUser();
  if (!user) return null;

  try {
    const db = getDb();
    const email = user.primaryEmailAddress?.emailAddress ?? null;

    const rows = await db
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

    return rows[0] ?? null;
  } catch (error) {
    // Missing DATABASE_URL in local dev, or a transient Neon outage:
    // log and let the page render anyway.
    console.warn("[sync-user] skipping DB sync:", (error as Error).message);
    return null;
  }
}
