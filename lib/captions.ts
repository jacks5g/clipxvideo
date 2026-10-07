import type { TranscriptWord, TranscriptionResult } from "./deepgram";

function toTimestamp(seconds: number, vtt: boolean) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return vtt
    ? `${pad(h)}:${pad(m)}:${pad(sec)}.${String(ms).padStart(3, "0")}`
    : `${pad(h)}:${pad(m)}:${pad(sec)},${String(ms).padStart(3, "0")}`;
}

export type CaptionCue = { start: number; end: number; text: string };

/** Groups word timings into readable cues (~8 words or 0.8s gap). */
export function wordsToCues(words: TranscriptWord[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let current: TranscriptWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word).join(" "),
    });
    current = [];
  };
  for (const w of words) {
    if (
      current.length > 0 &&
      (w.start - current[current.length - 1].end > 0.8 ||
        current.length >= 8)
    ) {
      flush();
    }
    current.push(w);
  }
  flush();
  return cues;
}

export function cuesToSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map(
        (c, i) =>
          `${i + 1}\n${toTimestamp(c.start, false)} --> ${toTimestamp(c.end, false)}\n${c.text}\n`,
      )
      .join("\n") + "\n"
  );
}

export function cuesToVtt(cues: CaptionCue[]): string {
  return (
    "WEBVTT\n\n" +
    cues
      .map(
        (c) =>
          `${toTimestamp(c.start, true)} --> ${toTimestamp(c.end, true)}\n${c.text}\n`,
      )
      .join("\n") +
    "\n"
  );
}

/** Builds SRT + VTT captions from a transcription result. */
export function buildCaptions(result: TranscriptionResult): {
  srt: string;
  vtt: string;
  cueCount: number;
} {
  let cues = wordsToCues(result.words);
  if (cues.length === 0) {
    const sentences = result.text.match(
      /[^.!?]+[.!?]+["”)]?|\S+(?:\s+\S+){0,11}/g,
    ) ?? [result.text];
    const total = result.duration ?? 60;
    const per = total / Math.max(1, sentences.length);
    cues = sentences.map((s, i) => ({
      start: i * per,
      end: (i + 1) * per,
      text: s.trim(),
    }));
  }
  return { srt: cuesToSrt(cues), vtt: cuesToVtt(cues), cueCount: cues.length };
}
