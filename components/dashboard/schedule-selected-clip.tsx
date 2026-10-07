"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Carried over from the project detail page via query params
 * (`projectId`, `shortId`, `title`) when the user clicks "Schedule video".
 * Renders nothing when the page is opened directly.
 */
export function ScheduleSelectedClip() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const shortId = searchParams.get("shortId");
  const title = searchParams.get("title");

  if (!projectId || !shortId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-brand" aria-hidden />
          Selected clip
        </CardTitle>
        <CardDescription>
          Carried over from the project page — pick it up as soon as a channel
          is connected.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
          <p className="min-w-0 truncate text-sm font-medium">
            {title ?? "Short clip"}
          </p>
          <Badge variant="secondary">#{shortId.slice(0, 8)}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/dashboard/projects/${projectId}`} />}
          >
            Back to project
          </Button>
          <Button size="sm" disabled>
            Schedule — connect a channel first
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Publishing isn&apos;t connected yet — once you link a channel, this
          clip can be queued to TikTok, Shorts or Reels.
        </p>
      </CardContent>
    </Card>
  );
}