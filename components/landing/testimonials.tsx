import { Quote, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "./section-heading";

const testimonials = [
  {
    quote:
      "We turned a 70-minute podcast into 14 clips over a coffee break. One of them hit 1.2M views — the AI nailed the hook better than we did.",
    name: "Maya Chen",
    role: "Host, The Signal Podcast",
    initials: "MC",
  },
  {
    quote:
      "Our team used to spend a full day per webinar on cutdowns. FastXClip does it in ten minutes, captions included, and the virality score keeps us honest.",
    name: "Diego Alvarez",
    role: "Growth Lead, Loopcast",
    initials: "DA",
  },
  {
    quote:
      "The auto-reframe is uncanny. Two speakers, constant movement, and every vertical clip is framed perfectly with word-by-word captions.",
    name: "Priya Raman",
    role: "Creator, 480k subscribers",
    initials: "PR",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Loved by creators"
          title="Results people actually talk about"
          description="From solo creators to media teams — here's what changes when the editing does itself."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="gap-5">
              <CardContent className="gap-5">
                <div aria-hidden className="flex items-center gap-1 text-brand">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="size-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed text-foreground">
                  <Quote aria-hidden className="mb-2 size-5 text-brand/60" />
                  {testimonial.quote}
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-brand-foreground"
                  >
                    {testimonial.initials}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {testimonial.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {testimonial.role}
                    </span>
                  </span>
                </figcaption>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
