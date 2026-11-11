import nodemailer from 'nodemailer';

import { config } from '../../config/env.js';

const BRAND = 'Global Care Cure';

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
            // Development fallback: no SMTP set up, so print the message instead
            console.log(`[mail:dev] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
            return;
        }

        await this.getTransporter().sendMail({
            from: config.EMAIL_FROM ?? `"${BRAND}" <${config.EMAIL_USER}>`,
            ...mail,
        });
    }

    async sendSetPasswordEmail(to: string, name: string, link: string): Promise<void> {
        const hours = config.SET_PASSWORD_TTL_HOURS;
        const safeName = escapeHtml(name);
        const safeLink = escapeHtml(link);

        await this.send({
            to,
            subject: `Your ${BRAND} account is approved: set your password`,
            text: [
                `Hello ${name},`,
                '',
                'Your application has been approved. Set your password to log in:',
                link,
                '',
                `This link is valid for ${hours} hours and can be used once.`,
                'If you did not apply, you can ignore this email.',
            ].join('\n'),
            html: `
                <p>Hello ${safeName},</p>
                <p>Your application has been approved. Set your password to log in:</p>
                <p><a href="${safeLink}">Set my password</a></p>
                <p>This link is valid for ${hours} hours and can be used once.</p>
                <p>If you did not apply, you can ignore this email.</p>`,
        });
    }

    async sendApplicationReceivedEmail(to: string, name: string): Promise<void> {
        await this.send({
            to,
            subject: `We received your application to ${BRAND}`,
            text: [
                `Hello ${name},`,
                '',
                'Thank you for applying. Our team will verify your credentials.',
                'You will receive an email as soon as the review is complete.',
            ].join('\n'),
            html: `
                <p>Hello ${escapeHtml(name)},</p>
                <p>Thank you for applying. Our team will verify your credentials.</p>
                <p>You will receive an email as soon as the review is complete.</p>`,
        });
    }

    async sendApplicationRejectedEmail(to: string, name: string, reason: string): Promise<void> {
        await this.send({
            to,
            subject: `Update on your ${BRAND} application`,
            text: [
                `Hello ${name},`,
                '',
                'We could not approve your application at this time.',
                `Reason: ${reason}`,
                '',
                'You are welcome to apply again with corrected information.',
            ].join('\n'),
            html: `
                <p>Hello ${escapeHtml(name)},</p>
                <p>We could not approve your application at this time.</p>
                <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
                <p>You are welcome to apply again with corrected information.</p>`,
        });
    }

    // async sendNewApplicationAdminEmail(
    //     to: string[],
    //     doctorName: string,
    //     hospitalName: string,
    //     link: string,
    // ): Promise<void> {
    //     await this.send({
    //         to: to.join(', '),
    //         subject: `New doctor application: ${doctorName}`,
    //         text: [
    //             'A new doctor application is waiting for review.',
    //             '',
    //             `Doctor: ${doctorName}`,
    //             `Hospital: ${hospitalName}`,
    //             '',
    //             `Review it here: ${link}`,
    //         ].join('\n'),
    //         html: `
    //             <p>A new doctor application is waiting for review.</p>
    //             <p><strong>Doctor:</strong> ${escapeHtml(doctorName)}<br>
    //             <strong>Hospital:</strong> ${escapeHtml(hospitalName)}</p>
    //             <p><a href="${escapeHtml(link)}">Open the application</a></p>`,
    //     });
    // }
    async sendNewApplicationAdminEmail(
        to: string[],
        applicantName: string,
        organisation: string,
        link: string,
        kind: 'doctor' | 'hospital' = 'doctor',
    ): Promise<void> {
        const applicantLabel = kind === 'doctor' ? 'Doctor' : 'Contact person';
        const organisationLabel = kind === 'doctor' ? 'Hospital' : 'Hospital';
        const subject =
            kind === 'doctor'
                ? `New doctor application: ${applicantName}`
                : `New hospital application: ${organisation}`;

        await this.send({
            to: to.join(', '),
            subject,
            text: [
                `A new ${kind} application is waiting for review.`,
                '',
                `${applicantLabel}: ${applicantName}`,
                `${organisationLabel}: ${organisation}`,
                '',
                `Review it here: ${link}`,
            ].join('\n'),
            html: `
            <p>A new ${kind} application is waiting for review.</p>
            <p><strong>${applicantLabel}:</strong> ${escapeHtml(applicantName)}<br>
            <strong>${organisationLabel}:</strong> ${escapeHtml(organisation)}</p>
            <p><a href="${escapeHtml(link)}">Open the application</a></p>`,
        });
    }

    async sendVerificationOtpEmail(
        to: string,
        name: string,
        otp: string,
        minutes: number,
    ): Promise<void> {
        await this.send({
            to,
            subject: `${otp} is your ${BRAND} verification code`,
            text: [
                `Hello ${name},`,
                '',
                `Your verification code is: ${otp}`,
                '',
                `It expires in ${minutes} minutes. Do not share it with anyone.`,
                'If you did not create an account, you can ignore this email.',
            ].join('\n'),
            html: `
                <p>Hello ${escapeHtml(name)},</p>
                <p>Your verification code is:</p>
                <p style="font-size:28px;letter-spacing:6px;font-weight:bold">${escapeHtml(otp)}</p>
                <p>It expires in ${minutes} minutes. Do not share it with anyone.</p>
                <p>If you did not create an account, you can ignore this email.</p>`,
        });
    }

    // Plain, short notices: appointment emails never contain medical details
    async sendAppointmentEmail(
        to: string,
        name: string,
        subject: string,
        lines: string[],
    ): Promise<void> {
        await this.send({
            to,
            subject,
            text: [`Hello ${name},`, '', ...lines].join('\n'),
            html: `<p>Hello ${escapeHtml(name)},</p>${lines
                .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ''))
                .join('')}`,
        });
    }
}

export default new MailService();
