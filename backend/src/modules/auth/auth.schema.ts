import { z } from 'zod';

const email = z.email().trim().toLowerCase();

// bcrypt only uses the first 72 bytes, so cap there.
const password = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password needs a lowercase letter')
    .regex(/[A-Z]/, 'Password needs an uppercase letter')
    .regex(/[0-9]/, 'Password needs a number');

export const registerSchema = z.object({
    orgName: z.string().trim().min(2).max(100),
    slug: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(40)
        .regex(
            /^[a-z0-9]+(-[a-z0-9]+)*$/,
            'Slug may only contain lowercase letters, numbers and hyphens',
        ),
    name: z.string().trim().min(2).max(100),
    email,
    password,
});

export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(72),
    orgId: z.uuid().optional(),
});

// The refresh token normally comes from the httpOnly cookie; the body is a fallback (Postman, mobile).
export const refreshSchema = z.object({
    refreshToken: z.string().min(20).optional(),
});

export const verifyEmailSchema = z.object({
    token: z.string().min(20),
});

export const resendVerificationSchema = z.object({ email });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
    token: z.string().min(20),
    password,
});

export type RegisterBody = z.output<typeof registerSchema>;
export type LoginBody = z.output<typeof loginSchema>;
export type RefreshBody = z.output<typeof refreshSchema>;
export type VerifyEmailBody = z.output<typeof verifyEmailSchema>;
export type ResendVerificationBody = z.output<typeof resendVerificationSchema>;
export type ForgotPasswordBody = z.output<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.output<typeof resetPasswordSchema>;