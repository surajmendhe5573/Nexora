import nodemailer from 'nodemailer';

import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';

const BRAND = 'Nexora';

export interface MailOptions {
    to: string;
    subject: string;
    text: string;
    html: string;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

interface MailTransport {
    sendMail(message: {
        from: string;
        to: string;
        subject: string;
        text: string;
        html: string;
    }): Promise<unknown>;
}

class MailService {
    private transporter: MailTransport | null = null;

    private isConfigured(): boolean {
        return Boolean(config.EMAIL_USER && config.EMAIL_PASS);
    }

    private getTransporter(): MailTransport {
        if (!this.transporter) {
            this.transporter = nodemailer.createTransport({
                host: config.EMAIL_HOST,
                port: config.EMAIL_PORT,
                secure: config.EMAIL_PORT === 465,
                auth: {
                    user: config.EMAIL_USER,
                    pass: (config.EMAIL_PASS ?? '').replace(/\s+/g, ''),
                },
            });
        }
        return this.transporter;
    }

    async send(mail: MailOptions): Promise<void> {
        if (!this.isConfigured()) {
            if (config.NODE_ENV === 'production') throw new Error('Email is not configured');
            // Development fallback: no SMTP set up, so print the message instead.
            logger.info(`[mail:dev] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
            return;
        }

        await this.getTransporter().sendMail({
            from: config.EMAIL_FROM ?? `"${BRAND}" <${config.EMAIL_USER}>`,
            ...mail,
        });
    }

    async sendVerificationEmail(
        to: string,
        name: string,
        link: string,
        hours: number,
    ): Promise<void> {
        await this.send({
            to,
            subject: `Verify your email for ${BRAND}`,
            text: [
                `Hello ${name},`,
                '',
                `Welcome to ${BRAND}. Verify your email address to activate your account:`,
                link,
                '',
                `This link is valid for ${hours} hours and can be used once.`,
                'If you did not create an account, you can ignore this email.',
            ].join('\n'),
            html: `
                <p>Hello ${escapeHtml(name)},</p>
                <p>Welcome to ${BRAND}. Verify your email address to activate your account:</p>
                <p><a href="${escapeHtml(link)}">Verify my email</a></p>
                <p>This link is valid for ${hours} hours and can be used once.</p>
                <p>If you did not create an account, you can ignore this email.</p>`,
        });
    }

    async sendPasswordResetEmail(
        to: string,
        name: string,
        link: string,
        hours: number,
    ): Promise<void> {
        await this.send({
            to,
            subject: `Reset your ${BRAND} password`,
            text: [
                `Hello ${name},`,
                '',
                'We received a request to reset your password. Choose a new one here:',
                link,
                '',
                `This link is valid for ${hours} hour(s) and can be used once.`,
                'If you did not request this, you can ignore this email. Your password stays the same.',
            ].join('\n'),
            html: `
                <p>Hello ${escapeHtml(name)},</p>
                <p>We received a request to reset your password. Choose a new one here:</p>
                <p><a href="${escapeHtml(link)}">Reset my password</a></p>
                <p>This link is valid for ${hours} hour(s) and can be used once.</p>
                <p>If you did not request this, you can ignore this email. Your password stays the same.</p>`,
        });
    }
}

export default new MailService();
