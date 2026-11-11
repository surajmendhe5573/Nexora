import type { CookieOptions, NextFunction, Request, Response } from 'express';

import { config } from '../../config/env.js';
import { statusCode } from '../../utils/statusCode.js';

import type {
    LoginBody,
    RegisterBody,
    ResendSetPasswordBody,
    ResendVerificationBody,
    SetPasswordBody,
    VerifyEmailBody,
} from './auth.schema.js';
import AuthService, { type RequestMeta } from './auth.service.js';

const COOKIE_NAME = 'refreshToken';
const COOKIE_PATH = '/api/v1/auth';

export default class AuthController {
    private authService = AuthService;

    private cookieOptions(expires: Date): CookieOptions {
        return {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax', // use 'none' (with secure) only if the frontend is on a different site
            path: COOKIE_PATH,
            expires,
        };
    }

    private metaOf(req: Request): RequestMeta {
        return { ip: req.ip, userAgent: req.get('user-agent') };
    }

    private refreshCookieOf(req: Request): string | undefined {
        return (req.cookies as Record<string, string | undefined> | undefined)?.[COOKIE_NAME];
    }

    register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = (req.validated as { body: RegisterBody }).body;
            const { email } = await this.authService.register(body, this.metaOf(req));

            res.success(
                'Registration successful. Please verify your email using the OTP sent to your registered email address.',
                { email, emailVerified: false },
                statusCode.CREATED,
            );
        } catch (err) {
            next(err);
        }
    };

    login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = (req.validated as { body: LoginBody }).body;
            const { user, accessToken, refreshToken, refreshExpiresAt } =
                await this.authService.login(body, this.metaOf(req));

            res.cookie(COOKIE_NAME, refreshToken, this.cookieOptions(refreshExpiresAt));
            res.success('Login successful', { user, accessToken }, statusCode.OK);
        } catch (err) {
            next(err);
        }
    };

    refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { accessToken, refreshToken, refreshExpiresAt } = await this.authService.refresh(
                this.refreshCookieOf(req),
                this.metaOf(req),
            );

            res.cookie(COOKIE_NAME, refreshToken, this.cookieOptions(refreshExpiresAt));
            res.success('Token refreshed', { accessToken }, statusCode.OK);
        } catch (err) {
            next(err);
        }
    };

    verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = (req.validated as { body: VerifyEmailBody }).body;
            await this.authService.verifyEmail(body, this.metaOf(req));
            res.success('Email verified successfully. You can now log in.', null, statusCode.OK);
        } catch (err) {
            next(err);
        }
    };

    resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = (req.validated as { body: ResendVerificationBody }).body;
            await this.authService.resendVerification(body.email);
            res.success(
                'If this email needs verification, a new code has been sent.',
                null,
                statusCode.OK,
            );
        } catch (err) {
            next(err);
        }
    };

    logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.logout(this.refreshCookieOf(req));
            res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
            res.success('Logged out', null, statusCode.OK);
        } catch (err) {
            next(err);
        }
    };

    me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = await this.authService.getMe(req.user!.id);
            res.success('Profile fetched', { user }, statusCode.OK);
        } catch (err) {
            next(err);
        }
    };

    setPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = (req.validated as { body: SetPasswordBody }).body;
            await this.authService.setPassword(body, this.metaOf(req));
            res.success('Password set. You can now log in.', null, statusCode.OK);
        } catch (err) {
            next(err);
        }
    };

    resendSetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const body = (req.validated as { body: ResendSetPasswordBody }).body;
            await this.authService.resendSetPassword(body.email);
            res.success(
                'If an approved account exists for this email, a new link has been sent.',
                null,
                statusCode.OK,
            );
        } catch (err) {
            next(err);
        }
    };
}
