import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Cta() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-brand/20 via-card to-brand-2/15 px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-dot-grid opacity-60"
          />
          <div className="relative flex flex-col items-center gap-5">
            <h2 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Ready to turn your long videos into{" "}
              <span className="text-gradient-brand">viral shorts</span>?
            </h2>
            <p className="max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
              Join 40,000+ creators who ship a week of short-form content before their coffee
              gets cold. Your first three videos are on us.
            </p>
            <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Button size="lg" render={<Link href="/sign-up" />}>
                Start creating free
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button size="lg" variant="outline" render={<Link href="#how-it-works" />}>
                <Play data-icon="inline-start" />
                Watch the workflow
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              No credit card required · 3 free videos · Cancel anytime
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
