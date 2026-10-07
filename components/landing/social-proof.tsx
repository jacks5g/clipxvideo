import { Film } from "lucide-react";

const brands = [
  "NorthPeak Media",
  "Loopcast",
  "Brightside TV",
  "Vertex Studios",
  "Kanso Labs",
  "ReelWorks",
];

export function SocialProof() {
  return (
    <section
      aria-label="Trusted by"
      className="border-y border-border/60 bg-muted/20"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-10 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Trusted by 40,000+ creators, podcasters and marketing teams
        </p>
        <ul className="grid w-full grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {brands.map((brand) => (
            <li
              key={brand}
              className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <Film aria-hidden className="size-4 shrink-0" />
              {brand}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
