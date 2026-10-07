import { Send, Upload, WandSparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "./section-heading";

type Step = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const steps: Step[] = [
  {
    icon: Upload,
    title: "Upload or paste a link",
    description:
      "Drop in an MP4, or paste a YouTube, Zoom or podcast link. Up to 3 hours of footage per video.",
  },
  {
    icon: WandSparkles,
    title: "AI cuts the best moments",
    description:
      "FastXClip detects engaging segments, reframes to vertical, writes captions and scores every clip.",
  },
  {
    icon: Send,
    title: "Review and publish",
    description:
      "Tweak a clip in the browser if you want, then export in 4K or schedule it to your channels.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-y border-border/60 bg-muted/20 py-16 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps. Ten minutes. A week of content."
          description="No timeline editing, no keyframes, no plugin soup — just upload and let the AI do the cutting."
        />

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex h-full flex-col gap-4 rounded-xl border border-border/70 bg-card p-6 shadow-xs ring-1 ring-foreground/5 transition-colors hover:border-brand/40">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-heading text-4xl font-semibold text-brand/20">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
