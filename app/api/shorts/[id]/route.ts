import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { shorts, projects } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from "@/lib/caption-styles";
import { eq, and } from "drizzle-orm";

/** PATCH /api/shorts/:id — save per-clip caption style JSON. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: { captionStyle?: Partial<CaptionStyle> };
  try {
    body = (await req.json()) as { captionStyle?: Partial<CaptionStyle> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.captionStyle || typeof body.captionStyle !== "object") {
    return NextResponse.json({ error: "captionStyle is required" }, { status: 400 });
  }

  const merged: CaptionStyle = {
    ...DEFAULT_CAPTION_STYLE,
    ...body.captionStyle,
    presetId: String(body.captionStyle.presetId ?? DEFAULT_CAPTION_STYLE.presetId),
  };
  // Keep legacy alias in sync.
  merged.uppercase = merged.textTransform === "uppercase";
  const captionStyleJson = JSON.stringify(merged);

  const db = getDb();
  const run = async () => {
    // Ownership check: shorts.userId must match, and project must belong to user.
    const rows = await db.select().from(shorts).where(eq(shorts.id, id)).limit(1);
    const short = rows[0];
    if (!short) return null;
    if (short.userId !== userId) return "forbidden" as const;
    const proj = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, short.projectId), eq(projects.userId, userId)))
      .limit(1);
    if (!proj[0]) return "forbidden" as const;
    const updated = await db
      .update(shorts)
      .set({ captionStyleJson, updatedAt: new Date() })
      .where(eq(shorts.id, id))
      .returning();
    return updated[0] ?? null;
  };

  try {
    const result = await run();
    if (result === "forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ short: result });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    await ensureProjectsSchema();
    // Column was just added — retry once.
    await db
      .update(shorts)
      .set({ captionStyleJson, updatedAt: new Date() })
      .where(eq(shorts.id, id));
    const rows = await db.select().from(shorts).where(eq(shorts.id, id)).limit(1);
    return NextResponse.json({ short: rows[0] ?? null });
  }
}
