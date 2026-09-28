export const MIN_NEW_PASSWORD_LENGTH = 12;
export const MAX_NEW_PASSWORD_LENGTH = 128;

export function isAcceptableNewPassword(password: string) {
  return password.length >= MIN_NEW_PASSWORD_LENGTH && password.length <= MAX_NEW_PASSWORD_LENGTH;
}

export const NEW_PASSWORD_REQUIREMENT = `${MIN_NEW_PASSWORD_LENGTH}–${MAX_NEW_PASSWORD_LENGTH} characters`;
