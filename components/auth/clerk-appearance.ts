/**
 * Shared Clerk appearance so the custom sign-in / sign-up pages match the
 * FastXClip dark-first theme (see Theme.md).
 *
 * Only semantic-token Tailwind utilities are used here — no raw colors —
 * so Clerk's prebuilt cards blend in with the shadcn surfaces.
 *
 * NOTE: intentionally NOT typed as Clerk's `Appearance` — the exact
 * `elements`/`variables` key sets drift between @clerk/* releases and the
 * `satisfies` check hard-fails the build. This structural type stays
 * assignable to the `appearance` prop without pinning key names.
 */
export const clerkAppearance: {
  elements: Record<string, string>;
} = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full",
    card: "w-full gap-6 rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xl shadow-black/40",
    headerTitle: "font-heading tracking-tight text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButton:
      "border-border bg-background text-foreground transition-colors hover:bg-muted hover:text-foreground",
    socialButtonsBlockButtonText: "text-foreground",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "rounded-md border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring",
    formFieldInputShowPasswordButton: "text-muted-foreground hover:text-foreground",
    formFieldAction: "text-brand hover:text-brand-2",
    formButtonPrimary:
      "rounded-md bg-gradient-brand text-brand-foreground shadow-md shadow-brand/25 transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
    footerActionLink: "text-brand hover:text-brand-2",
    footerActionText: "text-muted-foreground",
    identityPreview: "rounded-lg border border-border/70 bg-muted/40",
    identityPreviewText: "text-foreground",
    identityPreviewEditButton: "text-brand hover:text-brand-2",
    otpCodeFieldInput: "border-input text-foreground",
    alertText: "text-foreground",
    formResendCodeLink: "text-brand hover:text-brand-2",
  },
};
