import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

export default function CustomSignInPage() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      forceRedirectUrl="/dashboard"
      appearance={clerkAppearance}
    />
  );
}
