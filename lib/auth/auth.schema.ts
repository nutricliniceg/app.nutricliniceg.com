import { z } from 'zod';

export const emailField = z.string().email();
export const passwordField = z.string().min(8).max(128);
export const turnstileField = z.string().optional();
export const otpCodeField = z.string().length(6);

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: emailField,
  phone: z.string().min(10).max(20),
  password: passwordField,
  clinic_name: z.string().max(255).optional(),
  specialization: z.string().max(255).optional(),
  turnstile_token: turnstileField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
  turnstile_token: turnstileField,
});

export const forgotSchema = z.object({
  email: emailField,
  turnstile_token: turnstileField,
});

export const resetSchema = z.object({
  email: emailField,
  code: otpCodeField,
  password: passwordField,
});

export const verifySchema = z.object({
  userId: z.string().uuid(),
  code: otpCodeField,
});

export const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
