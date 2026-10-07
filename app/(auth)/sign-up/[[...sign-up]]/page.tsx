import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

export default function CustomSignUpPage() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      forceRedirectUrl="/dashboard"
      appearance={clerkAppearance}
    />
  );
}
