import { z } from 'zod';

// Shared field rules for forms (NFR-024: messages show under each field).

/** Strips spaces, dashes and brackets so "+234 803-000 0000" validates and is stored consistently. */
export const normalisePhone = (value: string) => value.replace(/[\s()-]/g, '');

// Nigerian mobiles (0803…, +234 803…), or any international number in + format for visitors.
const NG_MOBILE = /^(?:\+?234|0)[789][01]\d{8}$/;
const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;
export const isPhone = (value: string) => {
  const v = normalisePhone(value);
  return NG_MOBILE.test(v) || INTERNATIONAL.test(v);
};

export const nameSchema = z.string().trim().min(2, 'Enter a full name').max(80, 'Keep the name under 80 characters');
export const emailSchema = z.string().trim().min(1, 'Enter an email address').email('Enter a valid email address, e.g. name@example.com');
export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Enter a phone number')
  .refine(isPhone, 'Enter a valid phone number, e.g. +234 803 000 0000');

/** Ticket IDs look like HIP-7Q4K-2291. Accepts lower case and surrounding spaces. */
export const ticketCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^HIP-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Ticket IDs look like HIP-7Q4K-2291');

/** AUTH-002: at least 8 characters, with a number and a symbol. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/\d/, 'Add at least one number')
  .regex(/[^A-Za-z0-9]/, 'Add at least one symbol, e.g. ! or #');

export { passwordScore } from './passwordScore';

export const otpSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
