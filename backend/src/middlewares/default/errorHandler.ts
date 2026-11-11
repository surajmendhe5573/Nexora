import type { NextFunction, Request, Response } from 'express';

import logger from '../../utils/logger.js';

export default function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
    const log = req.log || logger;

    if (status >= 500) {
        log.error({ err, route: req.originalUrl, method: req.method }, err.message);
    } else {
        log.warn({ route: req.originalUrl, method: req.method, status }, err.message);
    }

    res.status(status).json({
        status: false,
        message:
            status === 500 && process.env.NODE_ENV === 'production'
                ? 'Internal Server Error'
                : err.message || 'Internal Server Error',
        errorCode: (err as Error & { errorCode?: string }).errorCode,
        timestamp: new Date().toISOString(),
        data: null,
        route: req.originalUrl,
    });
}
