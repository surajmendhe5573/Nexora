import { z } from 'zod';

const password = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number');

const email = z.string().trim().toLowerCase().pipe(z.email());

export const registerSchema = z.object({
    body: z.object({
        fullName: z.string().trim().min(2).max(100),
        email,
        phone: z
            .string()
            .trim()
            .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number with country code')
            .optional(),
        password,
        countryOfResidence: z.string().trim().min(2).max(60).optional(),
        preferredLanguage: z.string().trim().min(2).max(30).optional(),
        acceptTerms: z.literal(true, { error: 'You must accept the Terms and Privacy Policy' }),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email,
        password: z.string().min(1, 'Password is required'),
    }),
});

export const setPasswordSchema = z.object({
    body: z.object({
        email,
        token: z.string().length(64, 'This link is invalid'),
        password,
    }),
});

export const resendSetPasswordSchema = z.object({
    body: z.object({ email }),
});

export const verifyEmailSchema = z.object({
    body: z.object({
        email,
        otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    }),
});

export const resendVerificationSchema = z.object({
    body: z.object({ email }),
});

export type RegisterBody = z.infer<typeof registerSchema>['body'];
export type LoginBody = z.infer<typeof loginSchema>['body'];
export type SetPasswordBody = z.infer<typeof setPasswordSchema>['body'];
export type ResendSetPasswordBody = z.infer<typeof resendSetPasswordSchema>['body'];
export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>['body'];
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>['body'];
