import { UserProfile } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

export default function SettingsPage() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          User Settings
        </p>
        <h1 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Account settings
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Manage your profile, email addresses, and connected accounts. Changes
          apply everywhere you use FastXClip.
        </p>
      </div>

      <div className="flex justify-center">
        <UserProfile
          routing="hash"
          appearance={{
            elements: clerkAppearance.elements,
            variables: {
              colorBackground: "var(--card)",
              colorCard: "var(--card)",
              colorText: "var(--foreground)",
              colorTextSecondary: "var(--muted-foreground)",
              colorInputBackground: "var(--background)",
              colorInputText: "var(--foreground)",
              colorNeutral: "var(--muted)",
              colorPrimary: "var(--brand)",
            },
          }}
        />
      </div>
    </main>
  );
}
