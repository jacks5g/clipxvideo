"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  CalendarClock,
  Clapperboard,
  House,
  Settings,
  Tags,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

export const dashboardNavItems = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "My Videos", href: "/dashboard/my-videos", icon: Clapperboard },
  { label: "Schedule Post", href: "/dashboard/schedule-post", icon: CalendarClock },
  { label: "Pricing", href: "/dashboard/pricing", icon: Tags },
] as const;

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const displayName =
    user?.fullName ?? user?.firstName ?? user?.username ?? "Creator";
  const displayEmail = user?.primaryEmailAddress?.emailAddress;

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-0 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-brand-foreground shadow-md shadow-brand/25">
                <Clapperboard className="size-4" aria-hidden />
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="font-heading truncate font-semibold tracking-tight text-foreground">
                  FastXClip
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  AI shorts studio
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isNavActive(pathname, item.href)}
                    tooltip={item.label}
                    render={<Link href={item.href} />}
                  >
                    <item.icon aria-hidden />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isNavActive(pathname, "/dashboard/settings")}
              tooltip="Settings"
              render={<Link href="/dashboard/settings" />}
            >
              <Settings aria-hidden />
              <span>User Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2" />

        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "size-8",
                  },
                }}
              />
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium text-foreground">
                  {displayName}
                </span>
                {displayEmail ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {displayEmail}
                  </span>
                ) : null}
              </span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
