import type { Role } from '../../generated/prisma/client.js';

declare global {
    namespace Express {
        interface Request {
            user?: { id: string; role: Role };
            validated?: unknown;
        }

        interface Response {
            success: (message: string, data?: unknown, status?: number) => void;
            fail: (message: string, status?: number, extra?: Record<string, unknown>) => void;
        }
    }
}

export {};
