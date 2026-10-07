import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { syncCurrentUserToDb } from "@/lib/sync-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: proxy.ts already redirects signed-out visitors to
  // /sign-in, and this layout-level check guarantees no dashboard route
  // renders without a session — even if middleware is bypassed.
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // No webhooks: every visit upserts the Clerk user into Neon —
  // first sign-up creates the row, later visits refresh it.
  await syncCurrentUserToDb();

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <DashboardTopbar />
        <div className="relative flex flex-1 flex-col">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-glow-top"
          />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
