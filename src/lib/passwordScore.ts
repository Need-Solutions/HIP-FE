// The strength meter's score, kept free of zod so the meter (in components/ui) doesn't pull the form library into
// every page. The rules match passwordSchema in lib/validation.ts (AUTH-002: 8+ characters, a number and a symbol).

export const meetsPasswordRules = (pw: string) => pw.length >= 8 && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);

/** 0–4 for the strength meter. Meeting the rules gives "Good"; longer, mixed-case passwords score higher. */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  return meetsPasswordRules(pw) ? Math.max(score, 2) : Math.min(score, 1);
}
