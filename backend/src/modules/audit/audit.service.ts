import prisma from '../../config/db.js';
import type { Prisma, Role } from '../../generated/prisma/client.js';

export type AuditAction =
    | 'REPORT_UPLOADED'
    | 'REPORT_DOWNLOADED'
    | 'REPORT_DELETED'
    | 'PASSWORD_SET'
    | 'DOCTOR_REGISTERED'
    | 'DOCTOR_APPROVED'
    | 'DOCTOR_REJECTED'
    | 'PROVIDER_DOCUMENT_VIEWED'
    | 'DOCTOR_INVITE_RESENT'
    | 'EMAIL_VERIFIED'
    | 'DOCTOR_PROFILE_UPDATED'
    | 'CASE_SHARED'
    | 'CASE_SHARE_REVOKED'
    | 'CASE_VIEWED'
    | 'CASE_REPORTS_VIEWED'
    | 'DOCTOR_AVAILABILITY_UPDATED'
    | 'APPOINTMENT_REQUESTED'
    | 'APPOINTMENT_CONFIRMED'
    | 'APPOINTMENT_DECLINED'
    | 'APPOINTMENT_CANCELLED'
    | 'APPOINTMENT_COMPLETED'
    | 'APPOINTMENT_VIEWED'
    | 'CASE_CREATED'
    | 'CASE_UPDATED'
    | 'ENQUIRY_VIEWED'
    // Hospital audit actions
    | 'HOSPITAL_REGISTERED'
    | 'HOSPITAL_APPROVED'
    | 'HOSPITAL_REJECTED'
    | 'HOSPITAL_SUSPENDED'
    | 'HOSPITAL_REINSTATED'
    | 'HOSPITAL_INVITE_RESENT'
    | 'HOSPITAL_DOCUMENT_VIEWED'
    | 'HOSPITAL_ACCREDITATION_VERIFIED'
    | 'HOSPITAL_PROFILE_UPDATED';

export interface AuditEntry {
    actorId?: string | null;
    actorRole?: Role | null;
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    ip?: string;
    userAgent?: string;
    metadata?: Prisma.InputJsonObject;
}

class AuditService {
    async log(entry: AuditEntry, db: Prisma.TransactionClient = prisma): Promise<void> {
        await db.auditLog.create({
            data: {
                actorId: entry.actorId ?? null,
                actorRole: entry.actorRole ?? null,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId ?? null,
                ip: entry.ip,
                userAgent: entry.userAgent,
                metadata: entry.metadata,
            },
        });
    }
}

export default new AuditService();
