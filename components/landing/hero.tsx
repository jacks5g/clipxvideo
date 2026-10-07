import Link from "next/link";
import { ArrowRight, Play, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const stats = [
  { value: "2.4M+", label: "Clips generated" },
  { value: "40k+", label: "Creators & teams" },
  { value: "12x", label: "Faster editing" },
  { value: "4.9/5", label: "Average rating" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-glow-top"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-dot-grid" />

      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
        <div className="flex flex-col items-center text-center">
          <Badge
            variant="outline"
            className="gap-2 border-brand/30 bg-brand/10 px-3 py-1 text-brand hover:bg-brand/15"
          >
            <Sparkles />
            New — AI hooks &amp; b-roll suggestions
          </Badge>

          <h1 className="font-heading mt-6 max-w-3xl text-balance text-4xl leading-[1.05] font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Turn long videos into{" "}
            <span className="text-gradient-brand">viral shorts</span> in minutes
          </h1>

          <p className="mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            FastXClip watches your podcast, webinar or YouTube video, finds the most engaging
            moments, reframes them to 9:16, adds animated captions and scores every clip for
            virality — ready to post.
          </p>

          <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" render={<Link href="/sign-up" />}>
              Start creating free
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              render={<Link href="#how-it-works" />}
            >
              <Play data-icon="inline-start" />
              See how it works
            </Button>
          </div>

          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-brand" />
            No credit card · 3 free videos · Cancel anytime
          </p>
        </div>

        <HeroPreview />

        <dl className="mx-auto mt-16 grid w-full max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 text-center">
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {stat.value}
              </dd>
              <dd className="text-xs text-muted-foreground sm:text-sm">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const moments = [
  { time: "08:14", text: "The one habit that 10x'd our retention", score: 96 },
  { time: "21:47", text: "Why most creators quit after 90 days", score: 92 },
  { time: "37:02", text: "A 30-second story that closes deals", score: 88 },
];

const timelineSegments = [14, 9, 22, 11, 17, 8, 19];

function HeroPreview() {
  return (
    <div className="relative mt-14 w-full max-w-4xl sm:mt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-10 bottom-0 -z-10 rounded-[2rem] bg-gradient-to-b from-brand/20 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-2xl shadow-black/40 ring-1 ring-foreground/5 backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
          <div aria-hidden className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="hidden rounded-md border border-border/70 bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground sm:block">
            fastxclip.app/studio
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <span aria-hidden className="size-1.5 rounded-full bg-brand" />
            Rendering 6 clips
          </Badge>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_220px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">episode-142.mp4 · 1:04:22</span>
              <span className="shrink-0 font-medium text-brand">AI found 8 moments</span>
            </div>
            <ul className="flex flex-col gap-2">
              {moments.map((moment, index) => (
                <li
                  key={moment.time}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    index === 0
                      ? "border-brand/40 bg-brand/10"
                      : "border-border/60 bg-background/40"
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground">{moment.time}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {moment.text}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      index === 0 ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {moment.score}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-auto hidden flex-wrap gap-2 pt-1 sm:flex">
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                9:16 vertical
              </span>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                Auto captions
              </span>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
                Brand kit applied
              </span>
            </div>
          </div>

          <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[220px] flex-col justify-end gap-3 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-brand/30 via-card to-brand-2/25 p-3">
            <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">
              0:38 / 0:58
            </span>
            <div className="rounded-md bg-black/60 px-2 py-1.5 text-center text-[11px] font-semibold tracking-wide text-white">
              THIS CHANGED EVERYTHING
            </div>
            <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full w-2/3 rounded-full bg-gradient-brand" />
            </div>
          </div>
        </div>

        <div className="border-t border-border/70 bg-muted/30 px-4 py-3">
          <div aria-hidden className="flex h-8 items-stretch gap-1.5">
            {timelineSegments.map((width, index) => (
              <span
                key={index}
                style={{ flexGrow: width }}
                className={`rounded-sm ${
                  index % 3 === 1 ? "bg-brand/40" : "bg-muted-foreground/25"
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Timeline · 6 clips queued</span>
            <span className="text-brand">Est. done in 2 min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
