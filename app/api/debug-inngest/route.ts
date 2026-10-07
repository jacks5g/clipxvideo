import { NextResponse } from "next/server";

export async function GET() {
  try {
    const m1 = await import("@/inngest/client");
    const keys1 = Object.keys(m1);
    let fns: string = "not-loaded";
    try {
      const m2 = await import("@/inngest/functions/upload-video");
      fns = `loaded keys=${Object.keys(m2).join(",")} fnCount=${(m2 as { functions?: unknown[] }).functions?.length}`;
    } catch (e2) {
      return NextResponse.json({ stage: "functions-import", error: String((e2 as Error)?.stack ?? e2), clientKeys: keys1 }, { status: 500 });
    }
    let serveKeys = "not-loaded";
    try {
      const m3 = await import("inngest/next");
      serveKeys = Object.keys(m3).join(",");
    } catch (e3) {
      return NextResponse.json({ stage: "serve-import", error: String((e3 as Error)?.stack ?? e3), clientKeys: keys1, fns }, { status: 500 });
    }
    return NextResponse.json({ ok: true, clientKeys: keys1, fns, serveKeys });
  } catch (e) {
    return NextResponse.json({ stage: "client-import", error: String((e as Error)?.stack ?? e) }, { status: 500 });
  }
}
