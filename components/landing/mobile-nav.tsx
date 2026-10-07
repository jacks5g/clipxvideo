"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type NavItem = {
  label: string;
  href: string;
};

export function MobileNav({ items }: { items: NavItem[] }) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon-sm" className="md:hidden" />}
      >
        <Menu />
        <span className="sr-only">Open navigation menu</span>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>FastXClip</SheetTitle>
          <SheetDescription className="sr-only">
            Navigation menu for the landing page
          </SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
          {items.map((item) => (
            <SheetClose
              key={item.href}
              render={
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                />
              }
            >
              {item.label}
            </SheetClose>
          ))}
        </nav>
        <SheetFooter>
          <Show when="signed-out">
            <Button render={<Link href="/sign-up" />}>Start free trial</Button>
            <Button variant="outline" render={<Link href="/sign-in" />}>
              Sign in
            </Button>
          </Show>
          <Show when="signed-in">
            <Button render={<Link href="/dashboard" />}>Go to dashboard</Button>
          </Show>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}


