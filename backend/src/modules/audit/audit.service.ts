import prisma from '../../config/db.js';
import type { Prisma } from '../../generated/prisma/client.js';

// Add new actions here as you build more modules (member.role_changed, invoice.deleted, ...).
export type AuditAction =
    | 'auth.register'
    | 'auth.login'
    | 'auth.login_failed'
    | 'auth.logout'
    | 'auth.logout_all'
    | 'auth.token_reuse'
    | 'auth.email_verified'
    | 'auth.password_reset';

export interface AuditEntry {
    organizationId?: string | null;
    userId?: string | null;
    action: AuditAction;
    entityType?: string | null;
    entityId?: string | null;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    ip?: string | undefined;
}

class AuditService {
    // Pass a transaction client as `db` to make the log part of the same transaction as the change.
    async log(entry: AuditEntry, db: Prisma.TransactionClient = prisma): Promise<void> {
        await db.auditLog.create({
            data: {
                organizationId: entry.organizationId ?? null,
                userId: entry.userId ?? null,
                action: entry.action,
                entityType: entry.entityType ?? null,
                entityId: entry.entityId ?? null,
                ip: entry.ip ?? null,
                ...(entry.before !== undefined && { before: entry.before }),
                ...(entry.after !== undefined && { after: entry.after }),
            },
        });
    }
}

export default new AuditService();
