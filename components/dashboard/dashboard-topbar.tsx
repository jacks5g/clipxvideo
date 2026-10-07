"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { dashboardNavItems } from "@/components/dashboard/app-sidebar";

const extraTitles: Record<string, string> = {
  "/dashboard/settings": "User Settings",
};

export function DashboardTopbar() {
  const pathname = usePathname();

  const activeItem =
    [...dashboardNavItems].reverse().find((item) =>
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? null;

  const title = activeItem?.label ?? extraTitles[pathname] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <p className="truncate text-sm font-medium text-muted-foreground">
          Dashboard <span aria-hidden className="mx-1 text-border">/</span>{" "}
          <span className="text-foreground">{title}</span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="hidden shrink-0 text-muted-foreground sm:inline-flex"
          render={<Link href="/" />}
        >
          <ArrowLeft data-icon="inline-start" />
          Back to site
        </Button>
      </div>
    </header>
  );
}
