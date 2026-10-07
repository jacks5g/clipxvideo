"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

type Cycle = "monthly" | "annual";

const plans = [
  {
    name: "Starter",
    description: "Try the workflow on your own videos.",
    monthly: 0,
    annual: 0,
    cta: "Start free",
    highlighted: false,
    features: [
      "3 videos per month",
      "Up to 30 min per upload",
      "720p exports with watermark",
      "Auto captions (English)",
      "Community support",
    ],
  },
  {
    name: "Creator",
    description: "For creators posting every week.",
    monthly: 19,
    annual: 15,
    cta: "Start free trial",
    highlighted: true,
    features: [
      "60 videos per month",
      "Up to 3 hours per upload",
      "4K exports, no watermark",
      "Captions in 40+ languages",
      "Virality score & AI hooks",
      "Brand templates",
      "Email support",
    ],
  },
  {
    name: "Studio",
    description: "For teams and agencies at scale.",
    monthly: 49,
    annual: 39,
    cta: "Start free trial",
    highlighted: false,
    features: [
      "Unlimited videos",
      "5 team seats included",
      "Everything in Creator",
      "Priority rendering queue",
      "Custom fonts & brand kit",
      "API access & webhooks",
      "Priority support",
    ],
  },
];

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <section
      id="pricing"
      className="scroll-mt-20 border-y border-border/60 bg-muted/20 py-16 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple pricing that scales with your output"
          description="Start free, upgrade when the views come in. Cancel anytime — no lock-in, no per-clip surprises."
        />

        <div className="mt-8 flex justify-center">
          <div
            role="group"
            aria-label="Billing cycle"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 p-1"
          >
            <button
              type="button"
              aria-pressed={cycle === "monthly"}
              onClick={() => setCycle("monthly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                cycle === "monthly"
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              aria-pressed={cycle === "annual"}
              onClick={() => setCycle("annual")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                cycle === "annual"
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Annual
              <span
                className={cn(
                  "ml-1.5 text-xs",
                  cycle === "annual" ? "text-brand-foreground/80" : "text-brand"
                )}
              >
                −20%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const price = cycle === "monthly" ? plan.monthly : plan.annual;
            return (
              <Card
                key={plan.name}
                className={cn(
                  "relative gap-5",
                  plan.highlighted &&
                    "border-brand/50 shadow-xl shadow-brand/10 ring-2 ring-brand/40 lg:-translate-y-2"
                )}
              >
                <CardHeader className="gap-2">
                  {plan.highlighted ? (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 border-transparent bg-gradient-brand px-3 text-brand-foreground">
                      Most popular
                    </Badge>
                  ) : null}
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="gap-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading text-4xl font-semibold tracking-tight text-foreground">
                      ${price}
                    </span>
                    <span className="text-sm text-muted-foreground">/ month</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {price === 0
                      ? "Free forever — no card required"
                      : cycle === "monthly"
                        ? "Billed monthly, cancel anytime"
                        : `Billed annually ($${price * 12}/year)`}
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="mt-auto">
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    render={<Link href="/sign-up" />}
                  >
                    {plan.cta}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          All plans include unlimited re-renders, commercial usage rights and GDPR-friendly
          storage.
        </p>
      </div>
    </section>
  );
}
