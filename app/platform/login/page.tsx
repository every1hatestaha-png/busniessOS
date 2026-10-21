import SignInPage from "@/app/sign-in/[[...sign-in]]/page";

// This is a dedicated sign-in entry point. Successful authentication always
// returns to /platform, where verified owner identity and MFA are enforced.
export default function PlatformLoginPage() {
  return <SignInPage platformLogin />;
}
