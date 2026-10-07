import { Inngest } from "inngest";
import { serve as serveOrig } from "inngest/next";

// Single shared client — the serve route below registers `functions`.
export const inngest = new Inngest({ id: "fastxclip" });

// Wrap serve() to log the real error — Next dev swallows it as empty 500.
export function serveDebug(opts: Parameters<typeof serveOrig>[0]) {
  const handlers = serveOrig(opts) as Record<string, (req: Request) => Promise<Response>>;
  const wrapped: Record<string, (req: Request) => Promise<Response>> = {};
  for (const m of ["GET", "POST", "PUT"] as const) {
    wrapped[m] = async (req: Request) => {
      try {
        return await handlers[m](req);
      } catch (e) {
        console.error(`[inngest serve ${m}]`, e);
        return new Response(JSON.stringify({ error: String((e as Error)?.stack ?? e) }), { status: 500 });
      }
    };
  }
  return wrapped;
}

