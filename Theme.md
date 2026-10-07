# Theme.md — Theming Rules for Agents (FastXClip)

This file defines the **authoritative theming rules** for AI agents and contributors
working on this codebase. Follow it for every UI change. The product is an
**AI Long-to-Short Video Generator** with a **dark-first identity**.

---

## 1. Theme identity

| Property | Value |
| --- | --- |
| Theme mode | **Dark only** (default and required) |
| Base color scheme | Near-black, indigo-tinted neutrals |
| Brand / accent | Violet → Fuchsia gradient (`--brand` → `--brand-2`) |
| Typography | Inter (sans + heading), Geist Mono (mono) |
| Radius scale | `--radius: 0.625rem` (shadcn default) |
| UI kit | shadcn (base-vega style, Base UI primitives, Tailwind v4) |

---

## 2. File map

| File | Purpose |
| --- | --- |
| `app/globals.css` | All theme tokens (`:root` light fallback + `.dark`), `@theme inline` mappings, theme utility classes |
| `Theme.md` | This document — rules agents must follow |
| `app/layout.tsx` | Applies `dark` class to `<html>`, fonts, metadata |
| `components/ui/*` | shadcn primitives — style via variants only |
| `components/landing/*` | Landing sections, composed in `app/page.tsx` |

---

## 3. Rules (MUST / NEVER)

### 3.1 Dark mode is the theme
- **MUST** keep `className="dark"` on `<html>` in `app/layout.tsx`. The app ships dark by default; there is no theme toggle.
- **MUST** make every screen look correct with the `.dark` tokens active (they are the active tokens at runtime).
- **MUST NOT** add light-only styling and rely on `dark:` overrides for the default state. Base styles should already read as dark.
- **MAY** use `dark:` variants only for extra polish (e.g. `dark:border-input`), never as the primary mechanism.
- **MUST NOT** remove `color-scheme: dark` from the `.dark` block (it drives native scrollbars/inputs).

### 3.2 Use semantic tokens, never raw colors
- **MUST** use semantic tokens for all surfaces and text:
  - Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`, `bg-accent`
  - Text: `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `text-brand`
  - Lines: `border-border`, `border-input`, `bg-background`
  - Focus: `ring-ring` / `focus-visible:ring-ring/50`
- **MUST NOT** hardcode hex/rgb/oklch values inside components. Raw colors are only allowed in `app/globals.css` token definitions.
- **MAY** use opacity modifiers for hierarchy: `bg-muted/50`, `border-border/70`, `text-muted-foreground/80`.

### 3.3 Brand tokens
Defined in `app/globals.css` and registered in `@theme inline`:

| Token | Utility class | Use for |
| --- | --- | --- |
| `--brand` | `text-brand`, `bg-brand`, `border-brand/30`, `bg-brand/10` | Primary accent, eyebrows, icons, highlights |
| `--brand-foreground` | `text-brand-foreground` | Text on solid `bg-brand` |
| `--brand-2` | `text-brand-2`, gradients | Second gradient stop (fuchsia) |

- **MUST** derive new accent shades from these tokens (e.g. `bg-brand/10`, `ring-brand/40`) instead of picking new violets.
- Brand helper utilities (keep them in `globals.css`, do not inline their definitions elsewhere):
  - `bg-gradient-brand` — solid brand gradient (buttons, avatar marks, progress bars)
  - `text-gradient-brand` — gradient text for headline emphasis
  - `bg-dot-grid` — faded dotted background texture
  - `bg-glow-top` — soft top glow behind hero sections

### 3.4 Elevation & separation (dark theme specifics)
- **MUST** separate surfaces with `ring-1 ring-foreground/10`, `border border-border/70`, and blur (`backdrop-blur-md` + `bg-background/80`) — dark themes need borders more than shadows.
- **MAY** use deep colored shadows on hero/CTA cards: `shadow-brand/10`, `shadow-black/40`.
- **MUST NOT** use large light shadows (`shadow-lg` without color) — they are invisible on dark.


### 3.5 Typography
- **MUST** use `font-heading` for headings and `tracking-tight` on display sizes.
- **MUST** use `text-muted-foreground` for supporting copy; long paragraphs never sit at full `text-foreground` weight.
- **MUST** constrain prose width: `max-w-2xl` for section descriptions, `max-w-3xl`/`max-w-4xl` for hero headlines; add `text-balance` on multi-line headings.
- Scale: hero `text-4xl → sm:text-5xl → lg:text-6xl`; section title `text-3xl → sm:text-4xl`; lead paragraphs `text-base sm:text-lg`.
- **MUST** use uppercase + `tracking-widest` `text-xs` eyebrows for section labels.

### 3.6 Spacing & layout
- Section rhythm: `py-16 sm:py-24` (hero: `pt-16 sm:pt-24`). Container: `mx-auto w-full max-w-6xl px-4 sm:px-6`.
- Sticky header is `h-16`; every anchored section **MUST** have `scroll-mt-20` so headings are not hidden under it.
- Card grid gap: `gap-6` (dense grids `gap-4`).

### 3.7 Radius
- Cards / feature blocks: `rounded-xl` (`rounded-2xl` for large hero mock/CTA), controls `rounded-md`/`rounded-lg`, pills/badges `rounded-full`.
- **MUST NOT** invent radius values outside the `--radius-*` scale.

### 3.8 Motion & interaction
- Transitions: `transition-colors` / `transition-all duration-200`. Hover raises emphasis (brighter text, `bg-muted`, `border-brand/40`).
- **MUST** respect `prefers-reduced-motion` — decorative animation only, no heavy parallax/autoplay.
- Focus must stay visible: keep component defaults (`focus-visible:ring-3 focus-visible:ring-ring/50`); never remove outlines.

### 3.9 Icons
- Use `lucide-react` only (icon library configured in `components.json`).
- Sizes: `size-4` inline, `size-5` feature icons; color via `currentColor` or `text-brand` inside `bg-brand/10` tiles.
- **MUST NOT** add a second icon library or inline SVG sprite.

### 3.10 Extending shadcn components
- Style through existing variants (`variant`, `size`) plus `className`, composed with `cn()`.
- Only edit `components/ui/*` when adding a **new variant/token** — and document that token here.
- New semantic colors: add `--name` to **both** `:root` and `.dark`, register `--color-name: var(--name)` in `@theme inline`, then document here.

---

## 4. Don'ts (quick checklist)

- ❌ No light-mode pages, no theme toggle, no `light:` variants as the default look.
- ❌ No raw color literals in TSX (`#hex`, `rgb()`, `oklch()`).
- ❌ No new fonts — Inter (`--font-sans`/`--font-heading`) and Geist Mono only.
- ❌ No new UI libraries — shadcn + Tailwind v4 + lucide only.
- ❌ No `#fff`/`#000` text; use `text-foreground` / `text-muted-foreground`.
  - **Exception:** simulated media overlays (captions/timestamps drawn *on top of* arbitrary video content in product mocks) may use `text-white` / `bg-black/60` / `bg-white/20` so they stay legible over any frame.
- ❌ No layouts that depend on `dark:` being applied; the base state must already be correct.

## 5. Validation

Before finishing a UI task:

1. `app/layout.tsx` still renders `<html ... className="dark ...">`.
2. No raw colors in `components/**` or `app/**` (search for `#` hex / `oklch(`).
3. `npm run lint` and `npm run build` both pass.
4. Visually: sections separated by borders/glows (not shadows), headings use `font-heading`, supporting text is `text-muted-foreground`.
