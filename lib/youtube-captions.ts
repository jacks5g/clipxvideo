/**
 * YouTube caption import — transcribe link imports WITHOUT downloading bytes.
 * Pulls the video's subtitle track via the public timedtext endpoint and
 * shapes it into a Deepgram-compatible TranscriptionResult.
 * Zero deps: plain fetch + regex XML parsing.
 */

import type { TranscriptionResult, TranscriptWord } from "./deepgram";

export function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/live\/)([\w-]{6,})/,
    /youtu\.be\/([\w-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1].split(/[?&#]/)[0];
  }
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export type CaptionCue = { start: number; dur: number; text: string };

export function parseTimedtextXml(xml: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const re = /<text[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = stripTags(decodeXmlEntities(m[3] ?? ""));
    if (!text) continue;
    cues.push({ start: Number(m[1]) || 0, dur: Number(m[2]) || 0, text });
  }
  for (let i = 0; i < cues.length; i++) {
    if (!(cues[i].dur > 0)) {
      const next = cues[i + 1]?.start;
      cues[i].dur = next !== undefined && next > cues[i].start ? next - cues[i].start : 2;
    }
  }
  return cues;
}

export function pickTrackLang(listXml: string): string | null {
  const langs: string[] = [];
  const re = /lang_code="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(listXml)) !== null) {
    if (m[1] && !langs.includes(m[1])) langs.push(m[1]);
  }
  if (langs.length === 0) return null;
  for (const p of ["en", "en-US", "en-GB"]) {
    const hit = langs.find((l) => l.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return langs.find((l) => l.toLowerCase().startsWith("en")) ?? langs[0];
}

/** Fetches a YouTube video's captions; throws when none are available. */
export async function transcribeYouTubeLink(sourceUrl: string): Promise<TranscriptionResult> {
  const videoId = getYouTubeVideoId(sourceUrl);
  if (!videoId) throw new Error("Not a recognizable YouTube URL.");
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36",
  };
  const listRes = await fetch(
    `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
    { headers },
  );
  if (!listRes.ok) throw new Error("YouTube caption list unavailable - video may be private.");
  const lang = pickTrackLang(await listRes.text());
  if (!lang) throw new Error("This YouTube video has no captions - upload the file directly instead.");
  const urls = [
    `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(videoId)}`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`,
  ];
  let xml = "";
  for (const u of urls) {
    const r = await fetch(u, { headers });
    if (r.ok) {
      const t = await r.text();
      if (t.includes("<text")) { xml = t; break; }
    }
  }
  if (!xml) throw new Error("Could not download captions - upload the file directly instead.");
  const cues = parseTimedtextXml(xml);
  if (cues.length === 0) throw new Error("Empty YouTube caption track - upload the file directly instead.");
  const words: TranscriptWord[] = [];
  for (const cue of cues) {
    const parts = cue.text.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const per = cue.dur / parts.length;
    parts.forEach((word, i) => {
      const start = cue.start + i * per;
      words.push({ word, start, end: start + per });
    });
  }
  const text = cues.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Captions parsed to empty text - upload the file directly instead.");
  const last = cues[cues.length - 1];
  return {
    text, language: lang, duration: last.start + last.dur, words,
    utterances: cues.map((c) => ({ start: c.start, end: c.start + c.dur, transcript: c.text })),
  };
}

