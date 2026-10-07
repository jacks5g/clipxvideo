/** Safe clip filenames: "short-1-my-title.mp4" */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return slug || "short";
}

export function clipFileName(
  rank: number,
  title: string,
  ext: "mp4" | "webm",
  suffix?: string,
): string {
  const base = `short-${rank}-${slugifyTitle(title)}`;
  return suffix ? `${base}-${suffix}.${ext}` : `${base}.${ext}`;
}
