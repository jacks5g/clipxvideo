import { auth, currentUser } from "@clerk/nextjs/server";
import { Film, Scissors, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { projects, shorts } from "@/db/schema";
import { and, count, eq, gte } from "drizzle-orm";
import {
  DAILY_UPLOAD_LIMIT,
  remainingUploads,
  windowStart,
} from "@/lib/upload-quota";
import { VideoUploadHero } from "@/components/dashboard/video-upload-hero";
import { ProjectList } from "@/components/dashboard/project-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

const statIcons = { videos: Film, clips: Scissors, credits: Wallet } as const;

export default async function DashboardPage() {
  const user = await currentUser();
  const firstName = user?.firstName ?? "creator";
  const { userId } = await auth();

  // Live stats — the old page hardcoded "0 / 3" and "0 clips" so users
  // thought nothing was generated even when shorts existed.
  let videosToday = 0;
  let clipsTotal = 0;
  if (userId) {
    try {
      const db = getDb();
      const since = windowStart();
      const [v, c] = await Promise.all([
        db
          .select({ n: count() })
          .from(projects)
          .where(and(eq(projects.userId, userId), gte(projects.createdAt, since))),
        db.select({ n: count() }).from(shorts).where(eq(shorts.userId, userId)),
      ]);
      videosToday = Number(v[0]?.n ?? 0);
      clipsTotal = Number(c[0]?.n ?? 0);
    } catch {
      // Stats stay 0 — the project list below still renders.
    }
  }
  const stats = [
    { icon: statIcons.videos, label: "Videos today", value: `${videosToday} / ${DAILY_UPLOAD_LIMIT}` },
    { icon: statIcons.clips, label: "Clips generated", value: `${clipsTotal}` },
    { icon: statIcons.credits, label: "Uploads left today", value: `${remainingUploads(videosToday)}` },
  ];

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">Home</p>
        <h1 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Welcome back, {firstName}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Signed in as {user?.primaryEmailAddress?.emailAddress ?? "your account"}. Your
          clips, credits and exports will live here.
        </p>
      </div>

      <VideoUploadHero />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <stat.icon className="size-5" aria-hidden />
              </span>
              <CardDescription>{stat.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ProjectList />
    </main>
  );
}


