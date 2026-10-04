export const MIN_EMAIL_OTP_LENGTH = 6;
export const MAX_EMAIL_OTP_LENGTH = 10;

export function normalizeEmailOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, MAX_EMAIL_OTP_LENGTH);
}

export function isValidEmailOtp(value: string) {
  return /^\d+$/.test(value)
    && value.length >= MIN_EMAIL_OTP_LENGTH
    && value.length <= MAX_EMAIL_OTP_LENGTH;
}
