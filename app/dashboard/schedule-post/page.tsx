import { Suspense } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScheduleSelectedClip } from "@/components/dashboard/schedule-selected-clip";

export default function SchedulePostPage() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          Schedule Post
        </p>
        <h1 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Plan your publishing queue
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Queue clips to TikTok, Reels, and Shorts ahead of time. Connect a
          channel to start scheduling — nothing is connected yet.
        </p>
      </div>

      <Suspense fallback={null}>
        <ScheduleSelectedClip />
      </Suspense>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Upcoming posts</CardTitle>
            <CardDescription>
              Your scheduled clips will appear here in publish order.
            </CardDescription>
          </div>
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Schedule a clip
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
              <CalendarClock className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">
              No scheduled posts
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Once the scheduler ships, you&apos;ll pick a clip, a caption, and
              a time — FastXClip will post it for you.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
