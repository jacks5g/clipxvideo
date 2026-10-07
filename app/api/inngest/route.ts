import { inngest, serveDebug } from "@/inngest/client";
import { functions } from "@/inngest/functions/upload-video";
import { analysisFunctions } from "@/inngest/functions/analyze-video";

export const { GET, POST, PUT } = serveDebug({
  client: inngest,
  functions: [...functions, ...analysisFunctions],
});

