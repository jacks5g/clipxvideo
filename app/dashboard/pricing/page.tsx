import { Pricing } from "@/components/landing/pricing";

export default function DashboardPricingPage() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          Pricing
        </p>
        <h1 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Plans that scale with your output
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          You&apos;re on the Starter plan with 3 free videos per month. Upgrade
          when the views come in — cancel anytime.
        </p>
      </div>

      <div className="[&_section]:border-none [&_section]:bg-transparent [&_section]:p-0 [&_section]:py-0 [&_section>div]:max-w-none [&_section>div]:px-0">
        <Pricing />
      </div>
    </main>
  );
}
