import type { NextFunction, Request, Response } from 'express';

import type { Role } from '../generated/prisma/client.js';
import AuthService from '../modules/auth/auth.service.js';
import { statusCode } from '../utils/statusCode.js';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) {
        res.fail('Authentication required', statusCode.UNAUTHORIZED);
        return;
    }

    try {
        const payload = AuthService.verifyAccessToken(header.slice(7));
        req.user = { id: payload.sub, role: payload.role };
        next();
    } catch {
        res.fail('Invalid or expired token', statusCode.UNAUTHORIZED);
    }
}

export const authorize =
    (...roles: Role[]) =>
    (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.fail('Authentication required', statusCode.UNAUTHORIZED);
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.fail('You do not have permission', statusCode.FORBIDDEN);
            return;
        }
        next();
    };
