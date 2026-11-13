import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authenticate } from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/default/validate.js';

import AuthController from './auth.controller.js';
import {
    forgotPasswordSchema,
    loginSchema,
    refreshSchema,
    registerSchema,
    resendVerificationSchema,
    resetPasswordSchema,
    verifyEmailSchema,
} from './auth.schema.js';

const router = Router();
const controller = new AuthController();

// In-memory limiter for now; Phase 9 replaces it with a Redis sliding window.
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post('/register-organization', authLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', validate(refreshSchema), controller.logout);
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), controller.verifyEmail);
router.post(
    '/resend-verification',
    authLimiter,
    validate(resendVerificationSchema),
    controller.resendVerification,
);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), controller.resetPassword);

router.post('/logout-all', authenticate, controller.logoutAll);
router.get('/me', authenticate, controller.me);

export default router;