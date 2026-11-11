import 'dotenv/config';

import bcrypt from 'bcrypt';

import prisma from '../config/db.js';

async function main(): Promise<void> {
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    const fullName = process.env.SEED_ADMIN_NAME?.trim() || 'Super Admin';

    if (!email || !password) {
        throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env first');
    }
    if (password.length < 12) {
        throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`User ${email} already exists (role: ${existing.role}). Nothing to do.`);
        return;
    }

    await prisma.user.create({
        data: {
            fullName,
            email,
            passwordHash: await bcrypt.hash(password, 12),
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
        },
    });

    console.log(`SUPER_ADMIN created: ${email}`);
}

main()
    .catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
