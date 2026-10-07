import Link from "next/link";
import { ArrowRight, Clapperboard, LayoutDashboard } from "lucide-react";
import { Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { MobileNav, type NavItem } from "./mobile-nav";

export const navItems: NavItem[] = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-brand-foreground shadow-md shadow-brand/25">
            <Clapperboard />
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
            FastXClip
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-muted-foreground sm:inline-flex"
              render={<Link href="/sign-in" />}
            >
              Sign in
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" render={<Link href="/sign-up" />}>
              Start free
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Show>
          <Show when="signed-in">
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-muted-foreground sm:inline-flex"
              render={<Link href="/dashboard" />}
            >
              <LayoutDashboard data-icon="inline-start" />
              Dashboard
            </Button>
            <span className="hidden sm:inline-flex">
              <UserButton />
            </span>
          </Show>
          <MobileNav items={navItems} />
        </div>
      </div>
    </header>
  );
}
