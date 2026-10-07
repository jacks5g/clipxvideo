import Link from "next/link";
import { Clapperboard, ShieldCheck, Sparkles, Zap } from "lucide-react";

const highlights = [
  {
    icon: Zap,
    title: "3 free videos",
    description: "No credit card required to start clipping.",
  },
  {
    icon: Sparkles,
    title: "AI virality scores",
    description: "Every moment ranked before you export.",
  },
  {
    icon: ShieldCheck,
    title: "Cancel anytime",
    description: "Month-to-month plans, GDPR-friendly storage.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-glow-top"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dot-grid" />

      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-brand-foreground shadow-md shadow-brand/25">
            <Clapperboard />
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
            FastXClip
          </span>
        </Link>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-2 lg:gap-14">
        <div className="hidden max-w-md flex-col gap-8 lg:flex">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-widest text-brand uppercase">
              Start creating free
            </p>
            <h1 className="font-heading text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Turn long videos into <span className="text-gradient-brand">viral shorts</span> in
              minutes
            </h1>
            <p className="max-w-2xl text-balance text-base text-muted-foreground">
              Join 40,000+ creators shipping a week of short-form content before their coffee gets
              cold.
            </p>
          </div>
          <ul className="flex flex-col gap-4">
            {highlights.map((highlight) => (
              <li
                key={highlight.title}
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-4 backdrop-blur"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <highlight.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    {highlight.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {highlight.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-col items-center">{children}</div>
      </main>
    </div>
  );
}
