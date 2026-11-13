import type { CookieOptions, NextFunction, Request, Response } from 'express';

import { config } from '../../config/env.js';
import { statusCode } from '../../utils/statusCode.js';

import type {
    ForgotPasswordBody,
    LoginBody,
    RefreshBody,
    RegisterBody,
    ResendVerificationBody,
    ResetPasswordBody,
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

    private refreshTokenOf(req: Request): string | undefined {
        const fromCookie = (req.cookies as Record<string, string | undefined> | undefined)?.[
            COOKIE_NAME
        ];
        if (fromCookie) return fromCookie;
        return (req.body as RefreshBody | undefined)?.refreshToken;
    }

    register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const data = await this.authService.register(
                req.body as RegisterBody,
                this.metaOf(req),
            );
            res.status(statusCode.CREATED).json({
                success: true,
                message: 'Organization registered. Please verify your email.',
                data,
            });
        } catch (err) {
            next(err);
        }
    };

    login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { session, user } = await this.authService.login(
                req.body as LoginBody,
                this.metaOf(req),
            );
            res.cookie(COOKIE_NAME, session.refreshToken, this.cookieOptions(session.refreshExpiresAt));
            // refreshToken is also returned in the body for Postman/mobile. For a browser-only app, drop it.
            res.status(statusCode.OK).json({
                success: true,
                data: {
                    accessToken: session.accessToken,
                    refreshToken: session.refreshToken,
                    user,
                },
            });
        } catch (err) {
            next(err);
        }
    };

    refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const token = this.refreshTokenOf(req);
            if (!token) {
                res.fail('Refresh token missing', statusCode.UNAUTHORIZED);
                return;
            }
            const session = await this.authService.refresh(token, this.metaOf(req));
            res.cookie(COOKIE_NAME, session.refreshToken, this.cookieOptions(session.refreshExpiresAt));
            res.status(statusCode.OK).json({
                success: true,
                data: { accessToken: session.accessToken, refreshToken: session.refreshToken },
            });
        } catch (err) {
            next(err);
        }
    };

    logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.logout(this.refreshTokenOf(req));
            res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
            res.status(statusCode.OK).json({ success: true, message: 'Logged out' });
        } catch (err) {
            next(err);
        }
    };

    logoutAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.user) {
                res.fail('Authentication required', statusCode.UNAUTHORIZED);
                return;
            }
            await this.authService.logoutAll(req.user.id);
            res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
            res.status(statusCode.OK).json({
                success: true,
                message: 'Logged out from all devices',
            });
        } catch (err) {
            next(err);
        }
    };

    me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.user) {
                res.fail('Authentication required', statusCode.UNAUTHORIZED);
                return;
            }
            const data = await this.authService.me(req.user.id, req.user.orgId);
            res.status(statusCode.OK).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    };

    verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.verifyEmail(req.body as VerifyEmailBody);
            res.status(statusCode.OK).json({ success: true, message: 'Email verified' });
        } catch (err) {
            next(err);
        }
    };

    resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.resendVerification(req.body as ResendVerificationBody);
            // Same response whether or not the email exists.
            res.status(statusCode.OK).json({
                success: true,
                message: 'If the account exists and is not verified, a new link has been sent.',
            });
        } catch (err) {
            next(err);
        }
    };

    forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.forgotPassword(req.body as ForgotPasswordBody);
            res.status(statusCode.OK).json({
                success: true,
                message: 'If that email is registered, a password reset link has been sent.',
            });
        } catch (err) {
            next(err);
        }
    };

    resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.authService.resetPassword(req.body as ResetPasswordBody);
            res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
            res.status(statusCode.OK).json({
                success: true,
                message: 'Password updated. Please log in with your new password.',
            });
        } catch (err) {
            next(err);
        }
    };
}
