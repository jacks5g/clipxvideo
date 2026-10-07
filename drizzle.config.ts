import dotenv from "dotenv";
// Load BOTH so `push` works locally (.env.local) and in CI (.env).
dotenv.config({ path: ".env.local" });
dotenv.config();
import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` / `drizzle-kit migrate` / `drizzle-kit push` read
 * DATABASE_URL from .env.local (your Neon pooled connection string).
 * The explicit `dotenv/config` import is required — this drizzle-kit version
 * does NOT auto-load .env files, so `process.env.DATABASE_URL` was "" and
 * `push` died with "Please provide required params: [x] url: ''".
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // drizzle-kit loads .env files automatically in recent versions.
    url: process.env.DATABASE_URL ?? "",
  },
});
