import type { NextFunction, Request, Response } from 'express';

import { statusCode } from '../../utils/statusCode.js';

export default function notFound(req: Request, res: Response, _next: NextFunction): void {
    res.status(statusCode.NOT_FOUND).json({
        status: false,
        message: 'Route not found',
        timestamp: new Date().toISOString(),
        data: null,
        route: req.originalUrl,
    });
}
