import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';

import prisma from '../../config/db.js';
import { config } from '../../config/env.js';
import type { Role } from '../../generated/prisma/client.js';
import { statusCode } from '../../utils/statusCode.js';
import AuditService from '../audit/audit.service.js';
import MailService from '../mail/mail.service.js';

import type { LoginBody, RegisterBody, SetPasswordBody, VerifyEmailBody } from './auth.schema.js';

export interface RequestMeta {
    ip?: string;
    userAgent?: string;
}

export interface AccessPayload {
    sub: string;
    role: Role;
}

interface Session {
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: Date;
}

function httpError(message: string, status: number, errorCode?: string): Error {
    return Object.assign(new Error(message), { statusCode: status, errorCode });
}

const userSelect = {
    id: true,
    fullName: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    countryOfResidence: true,
    preferredLanguage: true,
    emailVerifiedAt: true,
    createdAt: true,
} as const;

const HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5pQ6o6x9r3vM3pG3m3o6h1Zr0bX4k7e';

class AuthService {
    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private signAccessToken(userId: string, role: Role): string {
        return jwt.sign({ role }, config.JWT_ACCESS_SECRET, {
            subject: userId,
            expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
        });
    }

    verifyAccessToken(token: string): AccessPayload {
        return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessPayload;
    }

    private async createSession(
        user: { id: string; role: Role },
        meta: RequestMeta,
    ): Promise<Session> {
        const refreshToken = crypto.randomBytes(48).toString('hex');
        const refreshExpiresAt = new Date(
            Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
        );

        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash: this.hashToken(refreshToken),
                expiresAt: refreshExpiresAt,
                ip: meta.ip,
                userAgent: meta.userAgent,
            },
        });

        return {
            accessToken: this.signAccessToken(user.id, user.role),
            refreshToken,
            refreshExpiresAt,
        };
    }

    // ---------- email OTP ----------
    private hashOtp(tokenId: string, otp: string): string {
        return crypto
            .createHmac('sha256', config.OTP_SECRET)
            .update(`${tokenId}:${otp}`)
            .digest('hex');
    }

    private generateOtp(): string {
        return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    }

    private otpExpiry(): Date {
        return new Date(Date.now() + config.OTP_TTL_MINUTES * 60 * 1000);
    }

    private async deliverOtp(
        user: { email: string; fullName: string },
        otp: string,
    ): Promise<void> {
        try {
            await MailService.sendVerificationOtpEmail(
                user.email,
                user.fullName,
                otp,
                config.OTP_TTL_MINUTES,
            );
        } catch (err) {
            console.error('Could not send verification email', err);
        }
    }

    async register(data: RegisterBody, meta: RequestMeta) {
        const existing = await prisma.user.findUnique({
            where: { email: data.email },
            select: { id: true },
        });
        if (existing) {
            throw httpError(
                'Email is already registered. If you have not verified it yet, request a new verification code.',
                statusCode.CONFLICT,
            );
        }

        const userId = crypto.randomUUID();
        const tokenId = crypto.randomUUID();
        const otp = this.generateOtp();
        const passwordHash = await bcrypt.hash(data.password, 12);

        // Role is never taken from the request: public sign-up is always PATIENT
        const user = await prisma.user.create({
            data: {
                id: userId,
                fullName: data.fullName,
                email: data.email,
                phone: data.phone,
                passwordHash,
                status: 'PENDING_VERIFICATION',
                countryOfResidence: data.countryOfResidence,
                preferredLanguage: data.preferredLanguage,
                consents: {
                    create: [
                        {
                            type: 'TERMS',
                            version: config.TERMS_VERSION,
                            ip: meta.ip,
                            userAgent: meta.userAgent,
                        },
                        {
                            type: 'PRIVACY',
                            version: config.PRIVACY_VERSION,
                            ip: meta.ip,
                            userAgent: meta.userAgent,
                        },
                    ],
                },
                authTokens: {
                    create: {
                        id: tokenId,
                        type: 'VERIFY_EMAIL',
                        tokenHash: this.hashOtp(tokenId, otp),
                        expiresAt: this.otpExpiry(),
                    },
                },
            },
            select: { email: true, fullName: true },
        });

        await this.deliverOtp(user, otp);
        return { email: user.email };
    }

    async login(data: LoginBody, meta: RequestMeta) {
        const found = await prisma.user.findUnique({ where: { email: data.email } });
        const valid = await bcrypt.compare(data.password, found?.passwordHash ?? HASH);

        if (!found || !valid) {
            throw httpError('Invalid email or password', statusCode.UNAUTHORIZED);
        }
        // Checked only after the password is correct, so this can't be used to probe emails
        if (found.status === 'SUSPENDED') {
            throw httpError('This account is suspended', statusCode.FORBIDDEN);
        }
        if (found.status !== 'ACTIVE') {
            throw httpError(
                'Email not verified. Please verify your email to continue.',
                statusCode.FORBIDDEN,
                'EMAIL_NOT_VERIFIED',
            );
        }

        await prisma.user.update({
            where: { id: found.id },
            data: { lastLoginAt: new Date() },
        });

        const user = await prisma.user.findUniqueOrThrow({
            where: { id: found.id },
            select: userSelect,
        });
        const session = await this.createSession(user, meta);
        return { user, ...session };
    }

    async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<Session> {
        if (!rawToken) throw httpError('Refresh token missing', statusCode.UNAUTHORIZED);

        const stored = await prisma.refreshToken.findUnique({
            where: { tokenHash: this.hashToken(rawToken) },
            include: { user: true },
        });
        if (!stored) throw httpError('Invalid refresh token', statusCode.UNAUTHORIZED);

        // A revoked token being used again may mean it was stolen: end all sessions
        if (stored.revokedAt) {
            await prisma.refreshToken.updateMany({
                where: { userId: stored.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            throw httpError('Session expired, please log in again', statusCode.UNAUTHORIZED);
        }
        if (stored.expiresAt < new Date()) {
            throw httpError('Session expired, please log in again', statusCode.UNAUTHORIZED);
        }
        if (stored.user.status !== 'ACTIVE') {
            throw httpError('This account is not active', statusCode.FORBIDDEN);
        }

        // Rotate: the old token is revoked, a new one is issued
        await prisma.refreshToken.update({
            where: { id: stored.id },
            data: { revokedAt: new Date() },
        });
        return this.createSession(stored.user, meta);
    }

    async verifyEmail(body: VerifyEmailBody, meta: RequestMeta): Promise<void> {
        // One message for every failure: unknown email, wrong code, expired, locked, already verified
        const invalid = (): Error =>
            httpError(
                'Invalid or expired verification code. Request a new one if needed.',
                statusCode.BAD_REQUEST,
            );

        const user = await prisma.user.findUnique({
            where: { email: body.email },
            select: { id: true, role: true, status: true },
        });
        if (!user || user.role !== 'PATIENT' || user.status !== 'PENDING_VERIFICATION') {
            throw invalid();
        }

        const token = await prisma.authToken.findFirst({
            where: {
                userId: user.id,
                type: 'VERIFY_EMAIL',
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!token) throw invalid();

        // Count this attempt first, atomically, so parallel guesses can't exceed the limit
        const counted = await prisma.authToken.updateMany({
            where: { id: token.id, usedAt: null, attempts: { lt: config.OTP_MAX_ATTEMPTS } },
            data: { attempts: { increment: 1 } },
        });
        if (counted.count === 0) throw invalid();

        const expected = Buffer.from(token.tokenHash, 'hex');
        const given = Buffer.from(this.hashOtp(token.id, body.otp), 'hex');
        if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
            throw invalid();
        }

        await prisma.$transaction(async (tx) => {
            // Single use, even if two correct requests arrive together
            const claimed = await tx.authToken.updateMany({
                where: { id: token.id, usedAt: null },
                data: { usedAt: new Date() },
            });
            if (claimed.count === 0) throw invalid();

            // The status guard means a suspended account is never activated
            const activated = await tx.user.updateMany({
                where: { id: user.id, status: 'PENDING_VERIFICATION' },
                data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
            });
            if (activated.count === 0) throw invalid();
        });

        await AuditService.log({
            actorId: user.id,
            actorRole: user.role,
            action: 'EMAIL_VERIFIED',
            entityType: 'User',
            entityId: user.id,
            ip: meta.ip,
            userAgent: meta.userAgent,
        });
    }

    async resendVerification(email: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, fullName: true, role: true, status: true },
        });
        if (!user || user.role !== 'PATIENT' || user.status !== 'PENDING_VERIFICATION') return;

        const now = Date.now();
        const recent = await prisma.authToken.findMany({
            where: {
                userId: user.id,
                type: 'VERIFY_EMAIL',
                createdAt: { gt: new Date(now - 60 * 60 * 1000) },
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        const last = recent[0];
        if (last && now - last.createdAt.getTime() < config.OTP_RESEND_COOLDOWN_SECONDS * 1000) {
            return;
        }
        if (recent.length >= config.OTP_MAX_PER_HOUR) return;

        const tokenId = crypto.randomUUID();
        const otp = this.generateOtp();

        // The previous code stops working as soon as a new one is issued
        await prisma.$transaction([
            prisma.authToken.updateMany({
                where: { userId: user.id, type: 'VERIFY_EMAIL', usedAt: null },
                data: { usedAt: new Date() },
            }),
            prisma.authToken.create({
                data: {
                    id: tokenId,
                    userId: user.id,
                    type: 'VERIFY_EMAIL',
                    tokenHash: this.hashOtp(tokenId, otp),
                    expiresAt: this.otpExpiry(),
                },
            }),
        ]);

        await this.deliverOtp(user, otp);
    }

    async logout(rawToken: string | undefined): Promise<void> {
        if (!rawToken) return;
        await prisma.refreshToken.updateMany({
            where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async getMe(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: userSelect,
        });
        if (!user) throw httpError('User not found', statusCode.NOT_FOUND);
        return user;
    }

    async createSetPasswordLink(userId: string, email: string): Promise<string> {
        const raw = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + config.SET_PASSWORD_TTL_HOURS * 60 * 60 * 1000);

        await prisma.$transaction([
            // Only the newest link works
            prisma.authToken.updateMany({
                where: { userId, type: 'SET_PASSWORD', usedAt: null },
                data: { usedAt: new Date() },
            }),
            prisma.authToken.create({
                data: { userId, type: 'SET_PASSWORD', tokenHash: this.hashToken(raw), expiresAt },
            }),
        ]);

        const base = config.APP_URL.replace(/\/+$/, '');
        return `${base}/set-password?token=${raw}&email=${encodeURIComponent(email)}`;
    }

    async sendSetPasswordInvite(user: {
        id: string;
        email: string;
        fullName: string;
    }): Promise<void> {
        const link = await this.createSetPasswordLink(user.id, user.email);
        await MailService.sendSetPasswordEmail(user.email, user.fullName, link);
    }

    async setPassword(body: SetPasswordBody, meta: RequestMeta): Promise<void> {
        const stored = await prisma.authToken.findFirst({
            where: {
                tokenHash: this.hashToken(body.token),
                type: 'SET_PASSWORD',
                usedAt: null,
                expiresAt: { gt: new Date() },
                user: { email: body.email },
            },
            include: { user: { select: { id: true, role: true, status: true } } },
        });
        if (!stored) throw httpError('This link is invalid or has expired', statusCode.BAD_REQUEST);
        if (stored.user.status === 'SUSPENDED') {
            throw httpError('This account is suspended', statusCode.FORBIDDEN);
        }

        const passwordHash = await bcrypt.hash(body.password, 12);

        await prisma.$transaction(async (tx) => {
            // Single use, even if two requests arrive at the same moment
            const claimed = await tx.authToken.updateMany({
                where: { id: stored.id, usedAt: null },
                data: { usedAt: new Date() },
            });
            if (claimed.count === 0) {
                throw httpError('This link is invalid or has expired', statusCode.BAD_REQUEST);
            }

            await tx.user.update({
                where: { id: stored.userId },
                data: { passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
            });
        });

        await AuditService.log({
            actorId: stored.userId,
            actorRole: stored.user.role,
            action: 'PASSWORD_SET',
            entityType: 'User',
            entityId: stored.userId,
            ip: meta.ip,
            userAgent: meta.userAgent,
        });
    }

    async resendSetPassword(email: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, fullName: true, passwordHash: true, status: true },
        });
        // Only accounts that are still waiting for their first password qualify
        if (!user || user.passwordHash !== null || user.status === 'SUSPENDED') return;

        // At most one email per minute per account
        const recent = await prisma.authToken.findFirst({
            where: {
                userId: user.id,
                type: 'SET_PASSWORD',
                createdAt: { gt: new Date(Date.now() - 60 * 1000) },
            },
            select: { id: true },
        });
        if (recent) return;

        try {
            await this.sendSetPasswordInvite(user);
        } catch (err) {
            console.error('Could not send set-password email', err);
        }
    }
}

export default new AuthService();
