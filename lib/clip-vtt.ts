/** VTT + SRT parse + relative-track heuristic shared by exporter. */
export type Cue = { start: number; end: number; text: string };
function toSec(h: string | undefined, m: string, s: string) {
  return (h ? parseFloat(h) : 0) * 3600 + parseFloat(m) * 60 + parseFloat(s);
}
/** Normalize SRT timestamps (00:00:05,000) to VTT (00:00:05.000) + CRLF. */
function normalizeInput(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}
/** Placeholder tracks mean "no speech" — never burn them onto video. */
export function isPlaceholderCue(text: string): boolean {
  return /\(no speech in this range\)/i.test((text ?? "").trim());
}
export function parseVtt(vtt: string): Cue[] {
  const src = normalizeInput(vtt);
  if (!src) return [];
  const lines = src.trim().split("\n");
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "WEBVTT" || line === "" || !line.includes("-->")) { i++; continue; }
    const m = line.match(/(?:(\d{2}):)?(\d{2}):(\d{2}\.\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2}\.\d{3})/);
    if (m) {
      const start = toSec(m[1], m[2], m[3]);
      const end = toSec(m[4], m[5], m[6]);
      let text = "";
      i++;
      while (i < lines.length && lines[i].trim() !== "") { text += lines[i].trim() + " "; i++; }
      const clean = text.trim();
      if (clean && !isPlaceholderCue(clean)) cues.push({ start, end, text: clean });
    } else i++;
  }
  return cues;
}
/** SRT shares the same cue shape — normalize then reuse the VTT parser. */
export function parseSrt(srt: string): Cue[] {
  return parseVtt(normalizeInput(srt ?? ""));
}
/** Try VTT first, fall back to SRT so a missing VTT column still burns captions. */
export function parseCaptions(vtt: string | null | undefined, srt?: string | null | undefined): Cue[] {
  const fromVtt = parseVtt(vtt ?? "");
  if (fromVtt.length > 0) return fromVtt;
  return parseSrt(srt ?? "");
}
export function cuesAreRelative(cues: Cue[], start: number, end: number) {
  if (!cues.length) return false;
  const min = Math.min(...cues.map((c) => c.start));
  const max = Math.max(...cues.map((c) => c.end));
  const dur = Math.max(0.5, end - start);
  if (max <= dur + 1 && min < 2) return true;
  if (min >= start - 0.5) return false;
  return min < 1;
}
export function cueAt(cues: Cue[], localT: number, relative: boolean, start: number): Cue | null {
  const at = localT + (relative ? 0 : start);
  return cues.find((c) => at >= c.start && at <= c.end) ?? null;
}
