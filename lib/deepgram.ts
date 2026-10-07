/**
 * Deepgram prerecorded transcription for uploaded videos.
 * Plain fetch against the hosted `listen` API (no SDK) so the Inngest
 * `transcribe-video` step turns the Storj playbackUrl into a full
 * transcript + word timings, from which we build SRT/VTT captions.
 */

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
  confidence?: number;
};

export type TranscriptionResult = {
  text: string;
  language: string | null;
  duration: number | null;
  words: TranscriptWord[];
  utterances: Array<{ start: number; end: number; transcript: string }> | null;
};

function deepgramEnv() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPGRAM_API_KEY is not set. Add it to .env.local (see .env.example) — get a key at https://console.deepgram.com.",
    );
  }
  return { apiKey };
}

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        languages?: string[];
        words?: Array<{
          word?: string;
          punctuated_word?: string;
          start?: number;
          end?: number;
          confidence?: number;
        }>;
      }>;
    }>;
    utterances?: Array<{ start?: number; end?: number; transcript?: string }>;
  };
  metadata?: { duration?: number; languages?: string[] };
};

/**
 * Transcribes the COMPLETE video at `videoUrl` via Deepgram prerecorded.
 * `videoUrl` is the Storj playbackUrl (public or signed GET) — Deepgram
 * fetches it directly, so Inngest never carries video bytes.
 */
export async function transcribeVideoUrl(
  videoUrl: string,
  opts?: { model?: string; language?: string },
): Promise<TranscriptionResult> {
  const { apiKey } = deepgramEnv();
  if (!/^https?:\/\//i.test(videoUrl)) {
    throw new Error(`transcribeVideoUrl: only http(s) videoUrl is supported`);
  }

  const params = new URLSearchParams({
    model: opts?.model ?? "nova-3",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    numerals: "true",
    words: "true",
  });
  if (opts?.language) params.set("language", opts.language);

  const res = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: videoUrl }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Deepgram transcription failed (${res.status}): ${body.slice(0, 500) || res.statusText}`,
    );
  }
  const json = (await res.json()) as DeepgramResponse;
  const alt = json.results?.channels?.[0]?.alternatives?.[0];
  const text = (alt?.transcript ?? "").trim();
  if (!text) {
    throw new Error(
      "Deepgram returned an empty transcript — the video may have no audible speech.",
    );
  }
  const words: TranscriptWord[] = (alt?.words ?? [])
    .filter((w) => typeof w.word === "string" && w.word.length > 0)
    .map((w) => ({
      word: w.punctuated_word ?? w.word ?? "",
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
    }));
  const utterances =
    json.results?.utterances?.map((u) => ({
      start: Number(u.start ?? 0),
      end: Number(u.end ?? 0),
      transcript: String(u.transcript ?? ""),
    })) ?? null;
  const language =
    alt?.languages?.[0] ?? json.metadata?.languages?.[0] ?? null;
  const duration =
    typeof json.metadata?.duration === "number"
      ? json.metadata.duration
      : words.length > 0
        ? words[words.length - 1].end
        : null;
  return { text, language, duration, words, utterances };
}
