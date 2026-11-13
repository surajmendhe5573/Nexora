import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';

import prisma from '../../config/db.js';
import { config } from '../../config/env.js';
import type { Role } from '../../generated/prisma/client.js';
import logger from '../../utils/logger.js';
import { statusCode } from '../../utils/statusCode.js';
import AuditService from '../audit/audit.service.js';
import MailService from '../mail/mail.service.js';

import type {
    ForgotPasswordBody,
    LoginBody,
    RegisterBody,
    ResendVerificationBody,
    ResetPasswordBody,
    VerifyEmailBody,
} from './auth.schema.js';

export interface RequestMeta {
    ip?: string | undefined;
    userAgent?: string | undefined;
}

export interface AccessPayload {
    sub: string;
    orgId: string;
    role: Role;
}

export interface Session {
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: Date;
}

interface IssuedSession extends Session {
    refreshTokenId: string;
}

// Works with both the normal client and a transaction client.
type RefreshDb = Pick<typeof prisma, 'refreshToken'>;

const BCRYPT_ROUNDS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

function httpError(message: string, status: number, errorCode?: string): Error {
    return Object.assign(new Error(message), { statusCode: status, errorCode });
}

class AuthService {
    // Compared against when the email does not exist, so response time does not reveal valid emails.
    private readonly dummyHash = bcrypt.hashSync('nexora-dummy-password', BCRYPT_ROUNDS);

    private hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private randomToken(bytes = 48): string {
        return crypto.randomBytes(bytes).toString('base64url');
    }

    private isUniqueViolation(err: unknown): boolean {
        return (
            typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
        );
    }

    private signAccessToken(userId: string, orgId: string, role: Role): string {
        return jwt.sign({ orgId, role }, config.JWT_ACCESS_SECRET, {
            subject: userId,
            algorithm: 'HS256',
            expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
        });
    }

    verifyAccessToken(token: string): AccessPayload {
        const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
        if (
            typeof payload === 'string' ||
            !payload.sub ||
            typeof payload['orgId'] !== 'string' ||
            typeof payload['role'] !== 'string'
        ) {
            throw httpError('Invalid access token', statusCode.UNAUTHORIZED);
        }
        return { sub: payload.sub, orgId: payload['orgId'], role: payload['role'] as Role };
    }

    private async issueSession(
        db: RefreshDb,
        args: {
            userId: string;
            orgId: string;
            role: Role;
            meta: RequestMeta;
            familyId?: string;
        },
    ): Promise<IssuedSession> {
        const refreshToken = this.randomToken();
        const refreshExpiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

        const row = await db.refreshToken.create({
            data: {
                userId: args.userId,
                organizationId: args.orgId,
                tokenHash: this.hashToken(refreshToken),
                familyId: args.familyId ?? crypto.randomUUID(),
                expiresAt: refreshExpiresAt,
                ip: args.meta.ip ?? null,
                userAgent: args.meta.userAgent?.slice(0, 255) ?? null,
            },
        });

        return {
            accessToken: this.signAccessToken(args.userId, args.orgId, args.role),
            refreshToken,
            refreshExpiresAt,
            refreshTokenId: row.id,
        };
    }

    private async revokeFamily(familyId: string): Promise<void> {
        await prisma.refreshToken.updateMany({
            where: { familyId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    // An email problem must never fail the request that triggered it (users can request a resend).
    // Phase 6 moves these onto a BullMQ queue with retries.
    private async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
        const link = `${config.APP_URL}/verify-email?token=${token}`;
        try {
            await MailService.sendVerificationEmail(email, name, link, VERIFY_TTL_HOURS);
        } catch (err) {
            logger.error({ err, email }, 'Failed to send verification email');
        }
    }

    private async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
        const link = `${config.APP_URL}/reset-password?token=${token}`;
        try {
            await MailService.sendPasswordResetEmail(email, name, link, RESET_TTL_HOURS);
        } catch (err) {
            logger.error({ err, email }, 'Failed to send password reset email');
        }
    }

    async register(body: RegisterBody, meta: RequestMeta) {
        const [existingUser, existingOrg] = await Promise.all([
            prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }),
            prisma.organization.findUnique({ where: { slug: body.slug }, select: { id: true } }),
        ]);
        if (existingUser) {
            throw httpError('Email is already registered', statusCode.CONFLICT, 'EMAIL_TAKEN');
        }
        if (existingOrg) {
            throw httpError('Organization slug is already taken', statusCode.CONFLICT, 'SLUG_TAKEN');
        }

        const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
        const verifyToken = this.randomToken(32);

        try {
            const { org, user } = await prisma.$transaction(async (tx) => {
                // Creates the FREE plan on first use, so no separate seed is needed yet.
                const plan = await tx.plan.upsert({
                    where: { name: 'FREE' },
                    update: {},
                    create: { name: 'FREE', maxMembers: 5, maxCustomers: 50, apiRatePerMin: 60 },
                });
                const org = await tx.organization.create({
                    data: { name: body.orgName, slug: body.slug, planId: plan.id },
                });
                const user = await tx.user.create({
                    data: { email: body.email, name: body.name, passwordHash },
                });
                await tx.membership.create({
                    data: { userId: user.id, organizationId: org.id, role: 'ADMIN' },
                });
                await tx.emailToken.create({
                    data: {
                        userId: user.id,
                        type: 'VERIFY_EMAIL',
                        tokenHash: this.hashToken(verifyToken),
                        expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * HOUR_MS),
                    },
                });
                await AuditService.log(
                    {
                        organizationId: org.id,
                        userId: user.id,
                        action: 'auth.register',
                        entityType: 'Organization',
                        entityId: org.id,
                        ip: meta.ip,
                    },
                    tx,
                );
                return { org, user };
            });

            void this.sendVerificationEmail(user.email, user.name, verifyToken);

            return {
                organization: { id: org.id, name: org.name, slug: org.slug },
                user: { id: user.id, name: user.name, email: user.email, role: 'ADMIN' as Role },
            };
        } catch (err) {
            // Two requests racing past the pre-check end up here.
            if (this.isUniqueViolation(err)) {
                throw httpError('Email or slug is already taken', statusCode.CONFLICT, 'CONFLICT');
            }
            throw err;
        }
    }

    async login(body: LoginBody, meta: RequestMeta) {
        const user = await prisma.user.findUnique({
            where: { email: body.email },
            include: { memberships: { include: { organization: true } } },
        });

        const passwordOk = await bcrypt.compare(body.password, user?.passwordHash ?? this.dummyHash);
        if (!user || !passwordOk || user.status !== 'ACTIVE') {
            if (user) {
                await AuditService.log({
                    userId: user.id,
                    action: 'auth.login_failed',
                    entityType: 'User',
                    entityId: user.id,
                    ip: meta.ip,
                });
            }
            // Same message for unknown email, wrong password and disabled user.
            throw httpError(
                'Invalid email or password',
                statusCode.UNAUTHORIZED,
                'INVALID_CREDENTIALS',
            );
        }

        // Checked after the password, so this message cannot be used to discover which emails exist.
        // Remove this block if you want to allow login before verification.
        if (!user.emailVerifiedAt) {
            throw httpError(
                'Please verify your email first',
                statusCode.FORBIDDEN,
                'EMAIL_NOT_VERIFIED',
            );
        }

        const active = user.memberships.filter(
            (m) => m.organization.status === 'ACTIVE' && !m.organization.deletedAt,
        );

        let membership = body.orgId
            ? active.find((m) => m.organizationId === body.orgId)
            : undefined;

        if (!body.orgId) {
            if (active.length > 1) {
                throw httpError(
                    'Multiple organizations found, pass orgId',
                    statusCode.CONFLICT,
                    'ORG_SELECTION_REQUIRED',
                );
            }
            membership = active[0];
        }
        if (!membership) {
            throw httpError(
                'No active organization for this account',
                statusCode.FORBIDDEN,
                'NO_ACTIVE_ORG',
            );
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        const session = await this.issueSession(prisma, {
            userId: user.id,
            orgId: membership.organizationId,
            role: membership.role,
            meta,
        });

        await AuditService.log({
            organizationId: membership.organizationId,
            userId: user.id,
            action: 'auth.login',
            entityType: 'User',
            entityId: user.id,
            ip: meta.ip,
        });

        return {
            session: {
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                refreshExpiresAt: session.refreshExpiresAt,
            } satisfies Session,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerifiedAt !== null,
                role: membership.role,
                organization: {
                    id: membership.organizationId,
                    name: membership.organization.name,
                    slug: membership.organization.slug,
                },
            },
        };
    }

    async refresh(rawToken: string, meta: RequestMeta): Promise<Session> {
        const invalid = (): Error =>
            httpError(
                'Invalid or expired refresh token',
                statusCode.UNAUTHORIZED,
                'INVALID_REFRESH_TOKEN',
            );

        const existing = await prisma.refreshToken.findUnique({
            where: { tokenHash: this.hashToken(rawToken) },
        });
        if (!existing) throw invalid();

        // A token that was already rotated is being replayed: assume theft and kill the whole family.
        if (existing.replacedById) {
            await this.revokeFamily(existing.familyId);
            logger.warn(
                { userId: existing.userId, familyId: existing.familyId },
                'Refresh token reuse detected',
            );
            await AuditService.log({
                organizationId: existing.organizationId,
                userId: existing.userId,
                action: 'auth.token_reuse',
                entityType: 'RefreshToken',
                entityId: existing.id,
                ip: meta.ip,
            });
            throw httpError(
                'Refresh token reuse detected, please log in again',
                statusCode.UNAUTHORIZED,
                'TOKEN_REUSED',
            );
        }

        if (existing.revokedAt || existing.expiresAt <= new Date()) throw invalid();

        // Re-read the membership so role changes and suspensions apply on every refresh.
        const membership = await prisma.membership.findUnique({
            where: {
                userId_organizationId: {
                    userId: existing.userId,
                    organizationId: existing.organizationId,
                },
            },
            include: { organization: true, user: true },
        });
        if (
            !membership ||
            membership.user.status !== 'ACTIVE' ||
            membership.organization.status !== 'ACTIVE' ||
            membership.organization.deletedAt
        ) {
            await this.revokeFamily(existing.familyId);
            throw invalid();
        }

        return prisma.$transaction(async (tx) => {
            // Atomic claim: if two requests race with the same token, only one wins.
            const claimed = await tx.refreshToken.updateMany({
                where: { id: existing.id, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            if (claimed.count === 0) throw invalid();

            const session = await this.issueSession(tx, {
                userId: existing.userId,
                orgId: existing.organizationId,
                role: membership.role,
                familyId: existing.familyId,
                meta,
            });
            await tx.refreshToken.update({
                where: { id: existing.id },
                data: { replacedById: session.refreshTokenId },
            });

            return {
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                refreshExpiresAt: session.refreshExpiresAt,
            };
        });
    }

    async logout(rawToken: string | undefined): Promise<void> {
        if (!rawToken) return;
        await prisma.refreshToken.updateMany({
            where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async logoutAll(userId: string): Promise<void> {
        await prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async me(userId: string, orgId: string) {
        const membership = await prisma.membership.findUnique({
            where: { userId_organizationId: { userId, organizationId: orgId } },
            include: { user: true, organization: { include: { plan: true } } },
        });
        if (!membership) {
            throw httpError('Session is no longer valid', statusCode.UNAUTHORIZED, 'INVALID_SESSION');
        }

        return {
            id: membership.user.id,
            name: membership.user.name,
            email: membership.user.email,
            emailVerified: membership.user.emailVerifiedAt !== null,
            role: membership.role,
            organization: {
                id: membership.organization.id,
                name: membership.organization.name,
                slug: membership.organization.slug,
                plan: membership.organization.plan.name,
            },
        };
    }

    async verifyEmail(body: VerifyEmailBody): Promise<void> {
        const row = await prisma.emailToken.findUnique({
            where: { tokenHash: this.hashToken(body.token) },
        });
        if (!row || row.type !== 'VERIFY_EMAIL' || row.usedAt || row.expiresAt <= new Date()) {
            throw httpError(
                'Invalid or expired verification token',
                statusCode.BAD_REQUEST,
                'INVALID_TOKEN',
            );
        }
        await prisma.$transaction([
            prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
            prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
        ]);
        await AuditService.log({
            userId: row.userId,
            action: 'auth.email_verified',
            entityType: 'User',
            entityId: row.userId,
        });
    }

    // Always resolves the same way, so it does not reveal whether an email exists or is verified.
    async resendVerification(body: ResendVerificationBody): Promise<void> {
        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (!user || user.emailVerifiedAt || user.status !== 'ACTIVE') return;

        const token = this.randomToken(32);
        await prisma.$transaction([
            // Older unused links stop working once a new one is issued.
            prisma.emailToken.deleteMany({
                where: { userId: user.id, type: 'VERIFY_EMAIL', usedAt: null },
            }),
            prisma.emailToken.create({
                data: {
                    userId: user.id,
                    type: 'VERIFY_EMAIL',
                    tokenHash: this.hashToken(token),
                    expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * HOUR_MS),
                },
            }),
        ]);
        void this.sendVerificationEmail(user.email, user.name, token);
    }

    // Always resolves the same way, so it does not reveal whether an email is registered.
    async forgotPassword(body: ForgotPasswordBody): Promise<void> {
        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (!user || user.status !== 'ACTIVE') return;

        const token = this.randomToken(32);
        await prisma.$transaction([
            prisma.emailToken.deleteMany({
                where: { userId: user.id, type: 'RESET_PASSWORD', usedAt: null },
            }),
            prisma.emailToken.create({
                data: {
                    userId: user.id,
                    type: 'RESET_PASSWORD',
                    tokenHash: this.hashToken(token),
                    expiresAt: new Date(Date.now() + RESET_TTL_HOURS * HOUR_MS),
                },
            }),
        ]);
        void this.sendPasswordResetEmail(user.email, user.name, token);
    }

    async resetPassword(body: ResetPasswordBody): Promise<void> {
        const row = await prisma.emailToken.findUnique({
            where: { tokenHash: this.hashToken(body.token) },
        });
        if (!row || row.type !== 'RESET_PASSWORD' || row.usedAt || row.expiresAt <= new Date()) {
            throw httpError(
                'Invalid or expired reset token',
                statusCode.BAD_REQUEST,
                'INVALID_TOKEN',
            );
        }

        const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
        await prisma.$transaction([
            prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
            prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
            // Receiving the reset email proves ownership, so an unverified email becomes verified.
            prisma.user.updateMany({
                where: { id: row.userId, emailVerifiedAt: null },
                data: { emailVerifiedAt: new Date() },
            }),
            // Every existing session is logged out after a password change.
            prisma.refreshToken.updateMany({
                where: { userId: row.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            }),
        ]);
        await AuditService.log({
            userId: row.userId,
            action: 'auth.password_reset',
            entityType: 'User',
            entityId: row.userId,
        });
    }
}

export default new AuthService();
