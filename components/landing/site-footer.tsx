import Link from "next/link";
import { Clapperboard, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Help center", href: "/help" },
      { label: "Tutorials", href: "/tutorials" },
      { label: "API docs", href: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
      { label: "Press kit", href: "/press" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
      { label: "Cookie policy", href: "/cookies" },
      { label: "Security", href: "/security" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-brand-foreground">
              <Clapperboard />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
              FastXClip
            </span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            The AI long-to-short video generator. Turn podcasts, webinars and long-form video
            into scroll-stopping shorts — automatically.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            render={<Link href="/contact" />}
          >
            <Mail data-icon="inline-start" />
            Contact sales
          </Button>
        </div>

        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {column.title}
            </h3>
            <ul className="flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} FastXClip. All rights reserved.</p>
          <p className="flex items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <a href="#features" className="transition-colors hover:text-foreground">
              Back to top
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
