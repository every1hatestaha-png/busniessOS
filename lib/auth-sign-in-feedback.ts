/**
 * Authentication errors are deliberately generic. An invalid-password response
 * cannot prove whether a customer has a legacy account, a typo, or no account.
 * Never silently register/replace an identity or treat a failed login as consent
 * to set a new password.
 */
type AuthFailure = {
  message: string;
  code?: string | null;
  status?: number;
};

export type SignInFeedback = {
  message: string;
  requiresEmailVerification: boolean;
};

export function getSignInFeedback(error: AuthFailure): SignInFeedback {
  const message = error.message.toLowerCase();
  if (error.code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return {
      message: "Your email has not been verified yet.",
      requiresEmailVerification: true,
    };
  }
  if (error.status === 429 || error.code === "over_request_rate_limit" || message.includes("rate limit") || message.includes("too many")) {
    return {
      message: "Too many sign-in attempts. Please wait a moment and try again.",
      requiresEmailVerification: false,
    };
  }
  if (error.code === "invalid_credentials" || message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return {
      message: "Email or password is incorrect.",
      requiresEmailVerification: false,
    };
  }
  return {
    message: "We could not sign you in right now. Please try again.",
    requiresEmailVerification: false,
  };
}
