import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/default/validate.js';

import AuthController from './auth.controller.js';
import {
    loginSchema,
    registerSchema,
    resendSetPasswordSchema,
    resendVerificationSchema,
    setPasswordSchema,
    verifyEmailSchema,
} from './auth.schema.js';

const router = Router();
const controller = new AuthController();

router.post('/register', validate(registerSchema), controller.register);
router.post('/login', validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

router.post('/verify-email', validate(verifyEmailSchema), controller.verifyEmail);
router.post(
    '/resend-verification',
    validate(resendVerificationSchema),
    controller.resendVerification,
);

router.post('/set-password', validate(setPasswordSchema), controller.setPassword);
router.post(
    '/resend-set-password',
    validate(resendSetPasswordSchema),
    controller.resendSetPassword,
);

export default router;
