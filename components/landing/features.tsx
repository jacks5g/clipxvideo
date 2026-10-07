import { Captions, Crop, Palette, Sparkles, TrendingUp, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "./section-heading";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: Sparkles,
    title: "AI moment detection",
    description:
      "Our model watches the full video and surfaces the hooks, punchlines and payoffs with the highest retention potential.",
  },
  {
    icon: Captions,
    title: "Animated captions",
    description:
      "Word-by-word subtitles in 40+ languages, styled with your brand fonts, colors and emoji highlights.",
  },
  {
    icon: Crop,
    title: "Smart auto-reframe",
    description:
      "Face and subject tracking keeps every speaker perfectly framed in 9:16, 1:1 or 16:9 — no keyframes needed.",
  },
  {
    icon: TrendingUp,
    title: "Virality score",
    description:
      "Every clip gets a 0–100 score plus an AI-written hook and title, so you always know what to post first.",
  },
  {
    icon: Palette,
    title: "Brand templates",
    description:
      "Lock in fonts, colors, logos and intro/outro once — every export stays perfectly on-brand.",
  },
  {
    icon: Zap,
    title: "Export & publish",
    description:
      "Send clips straight to TikTok, Shorts and Reels, or download 4K MP4s in a single click.",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Features"
          title="Everything you need to go from long-form to viral"
          description="One AI workflow replaces hours of manual cutting, reframing and captioning."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group gap-4 transition-all duration-200 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/10"
            >
              <CardContent className="gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <div className="flex flex-col gap-2">
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
