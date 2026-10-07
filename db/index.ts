import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Lazy Neon client — created on first query so `next build` / `next lint`
 * succeed even when DATABASE_URL isn't set yet.
 */
let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to .env.local (see .env.example).",
    );
  }
  if (!cached) {
    cached = drizzle(neon(url), { schema });
  }
  return cached;
}

export { schema };
