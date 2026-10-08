"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { ShortPlayer } from "@/components/dashboard/short-player";
import type { ShortClip } from "@/components/dashboard/short-clip-showcase";
import {
  CAPTION_FONTS,
  DEFAULT_CAPTION_STYLE,
  clamp,
  parseCaptionStyle,
  type CaptionAnimation,
  type CaptionPosition,
  type CaptionStyle,
  type CaptionTextTransform,
} from "@/lib/caption-styles";
import { CAPTION_PRESETS } from "@/lib/caption-presets";
import { cn } from "@/lib/utils";

type Props = {
  short: ShortClip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbackUrl: string | null;
  thumbnailUrl?: string | null;
  onSaved: (short: ShortClip) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ShortCaptionEditor({ short, open, onOpenChange, playbackUrl, thumbnailUrl, onSaved }: Props) {
  const [draft, setDraft] = useState<CaptionStyle>({ ...DEFAULT_CAPTION_STYLE });
  const [appliedJson, setAppliedJson] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && short) {
      const initial = parseCaptionStyle(short.captionStyleJson);
      setDraft(initial);
      setAppliedJson(JSON.stringify(initial));
      setError(null);
    }
  }, [open, short]);

  const patch = (p: Partial<CaptionStyle>) =>
    setDraft((d) => {
      const next = { ...d, ...p };
      if (p.textTransform) next.uppercase = p.textTransform === "uppercase";
      return next;
    });
  // Live preview: draft JSON drives the Remotion player instantly —
  // no manual "Apply" step needed.
  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);
  const hasUnapplied = appliedJson !== null && appliedJson !== draftJson;

  const save = async () => {
    if (!short) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/shorts/${short.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captionStyle: draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
      setAppliedJson(JSON.stringify(draft));
      onSaved({ ...short, captionStyleJson: JSON.stringify(draft) });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!short) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-full max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl lg:max-w-7xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b border-border/60 bg-muted/30 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base font-bold tracking-tight sm:text-lg">
              Edit captions — Short #{short.rank}
            </DialogTitle>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-brand uppercase">
              {draft.presetId === "custom" ? "Custom" : "9 styles"}
            </span>
          </div>
          <DialogDescription className="truncate text-xs sm:text-[13px]">
            {short.title} · Pick a style below — preview updates live on the
            phone. Save writes to DB.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[440px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">
            <Row label="Caption style · 3 × 3">
              <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Caption styles">
                {CAPTION_PRESETS.map((p) => {
                  const selected = draft.presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch({ ...p.style })}
                      aria-pressed={selected}
                      className={cn(
                        "group relative flex flex-col overflow-hidden rounded-2xl border-2 text-left transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97]",
                        selected
                          ? "border-brand bg-brand/[0.08] shadow-[0_0_0_3px_var(--brand)/15,0_8px_24px_-12px_var(--brand)/40]"
                          : "border-border/60 bg-card hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg",
                      )}
                    >
                      {/* Live mini preview of the actual caption look */}
                      <span className="flex h-[68px] items-center justify-center overflow-hidden bg-zinc-950 px-1.5">
                        <span
                          style={{
                            fontFamily: p.style.fontFamily,
                            fontWeight: p.style.fontWeight,
                            fontStyle: p.style.italic ? "italic" : "normal",
                            textTransform: p.style.textTransform,
                            fontSize: 13,
                            lineHeight: 1.2,
                            color: p.style.color,
                            backgroundColor:
                              p.style.backgroundOpacity <= 5
                                ? "transparent"
                                : p.style.backgroundColor,
                            borderRadius: Math.min(p.style.borderRadius, 8),
                            padding: "3px 7px",
                            textAlign: "center",
                            textShadow: p.style.shadow
                              ? "0 1px 6px rgba(0,0,0,0.8)"
                              : "none",
                            WebkitTextStroke:
                              p.style.strokeWidth > 0
                                ? `0.6px ${p.style.strokeColor}`
                                : undefined,
                          }}
                        >
                          Captions
                        </span>
                      </span>
                      <span className="flex flex-col gap-0.5 px-2 py-1.5">
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] leading-tight font-bold">
                            {p.name}
                          </span>
                          {selected ? (
                            <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-brand text-[9px] text-white">
                              ✓
                            </span>
                          ) : null}
                        </span>
                        <span className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
                          {p.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {draft.presetId === "custom"
                  ? "Custom tweaks active — pick a style to reset."
                  : "9 presets · tweaking anything below creates a custom style."}
              </p>
            </Row>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
              <p className="mb-3 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                Typography
              </p>
              <div className="flex flex-col gap-3.5">
                <Row label="Font style">
                  <NativeSelect
                    value={draft.fontFamily}
                    onChange={(e) => patch({ fontFamily: e.target.value, presetId: "custom" })}
                    className="w-full [&>select]:w-full"
                  >
                    {CAPTION_FONTS.map((f) => (
                      <NativeSelectOption key={f.id} value={f.stack}>
                        {f.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Row>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Text case">
                    <NativeSelect
                      value={draft.textTransform}
                      onChange={(e) =>
                        patch({ textTransform: e.target.value as CaptionTextTransform, presetId: "custom" })
                      }
                      className="w-full"
                    >
                      <NativeSelectOption value="uppercase">UPPERCASE</NativeSelectOption>
                      <NativeSelectOption value="none">As spoken</NativeSelectOption>
                      <NativeSelectOption value="capitalize">Capitalize</NativeSelectOption>
                      <NativeSelectOption value="lowercase">lowercase</NativeSelectOption>
                    </NativeSelect>
                  </Row>
                  <Row label="Weight">
                    <NativeSelect
                      value={String(draft.fontWeight)}
                      onChange={(e) => patch({ fontWeight: Number(e.target.value), presetId: "custom" })}
                      className="w-full"
                    >
                      <NativeSelectOption value="600">SemiBold</NativeSelectOption>
                      <NativeSelectOption value="800">ExtraBold</NativeSelectOption>
                      <NativeSelectOption value="900">Black</NativeSelectOption>
                    </NativeSelect>
                  </Row>
                </div>
                <Row label={`Size · ${draft.fontSize}px`}>
                  <Slider
                    value={[draft.fontSize]}
                    min={28}
                    max={110}
                    onValueChange={(v) => {
                      const first = Array.isArray(v) ? v[0] : v;
                      patch({ fontSize: clamp(first ?? 68, 28, 110), presetId: "custom" });
                    }}
                  />
                </Row>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
              <p className="mb-3 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                Colors & placement
              </p>
              <div className="flex flex-col gap-3.5">
                <Row label="Text + highlight">
                  <div className="flex items-center gap-2">
                    <Input type="color" value={draft.color} onChange={(e) => patch({ color: e.target.value, presetId: "custom" })} className="h-9 w-12 shrink-0 cursor-pointer p-1" aria-label="Caption color" />
                    <Input type="color" value={draft.highlightColor} onChange={(e) => patch({ highlightColor: e.target.value, presetId: "custom" })} className="h-9 w-12 shrink-0 cursor-pointer p-1" aria-label="Highlight color" />
                    <span className="truncate text-[11px] text-muted-foreground">Active word pops in highlight</span>
                  </div>
                </Row>
                <Row label={`Background · ${draft.backgroundOpacity}%`}>
                  <div className="flex items-center gap-2.5">
                    <Input type="color" value={draft.backgroundColor} onChange={(e) => patch({ backgroundColor: e.target.value, presetId: "custom" })} className="h-9 w-12 shrink-0 cursor-pointer p-1" aria-label="Background color" />
                    <Slider value={[draft.backgroundOpacity]} min={0} max={100} onValueChange={(v) => { const first = Array.isArray(v) ? v[0] : v; patch({ backgroundOpacity: first ?? 75, presetId: "custom" }); }} />
                  </div>
                </Row>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Position">
                    <NativeSelect value={draft.position} onChange={(e) => patch({ position: e.target.value as CaptionPosition, presetId: "custom" })} className="w-full">
                      <NativeSelectOption value="top">Top</NativeSelectOption>
                      <NativeSelectOption value="middle">Middle</NativeSelectOption>
                      <NativeSelectOption value="bottom">Bottom</NativeSelectOption>
                    </NativeSelect>
                  </Row>
                  <Row label="Animation">
                    <NativeSelect value={draft.animation} onChange={(e) => patch({ animation: e.target.value as CaptionAnimation, presetId: "custom" })} className="w-full">
                      <NativeSelectOption value="pop">Pop</NativeSelectOption>
                      <NativeSelectOption value="karaoke">Karaoke</NativeSelectOption>
                      <NativeSelectOption value="fade">Fade</NativeSelectOption>
                      <NativeSelectOption value="none">None</NativeSelectOption>
                    </NativeSelect>
                  </Row>
                </div>
              </div>
            </div>
            {error ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-border/60 bg-background/95 pt-3 pb-1 backdrop-blur">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const initial = parseCaptionStyle(short.captionStyleJson);
                  setDraft(initial);
                  setAppliedJson(JSON.stringify(initial));
                }}
              >
                <RotateCcw data-icon="inline-start" className="size-3.5" /> Reset
              </Button>
              <Button type="button" onClick={save} disabled={saving} className="flex-1">
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                {saving ? "Saving…" : hasUnapplied ? "Save style" : "Saved ✓"}
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-col overflow-y-auto border-t border-border/60 bg-zinc-950 px-4 py-5 lg:border-t-0 lg:border-l">
            <div className="mx-auto flex w-full max-w-[320px] flex-1 flex-col items-center">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-widest text-zinc-400 uppercase">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Live preview · 9:16
              </p>
              {/* Height-capped phone frame: width follows 9:16 ratio but never
                  overflows the dialog — Player fills it edge-to-edge. */}
              <div className="w-full" style={{ maxWidth: "min(320px, calc((74vh) * 9 / 16))" }}>
                <div className="overflow-hidden rounded-[28px] ring-1 ring-white/15 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]">
                  <ShortPlayer
                    src={playbackUrl}
                    startSeconds={short.startSeconds}
                    endSeconds={short.endSeconds}
                    captionsVtt={short.captionsVtt}
                    captionsSrt={short.captionsSrt}
                    captionStyleJson={draftJson}
                    title={short.title}
                    thumbnailUrl={thumbnailUrl}
                    autoLoad
                  />
                </div>
              </div>
              <p className="mt-3 max-w-[280px] text-center text-[11px] leading-relaxed text-zinc-500">
                Every click above re-renders instantly — no Apply needed.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
