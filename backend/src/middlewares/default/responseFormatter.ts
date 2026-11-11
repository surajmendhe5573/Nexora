import type { NextFunction, Request, Response } from 'express';

export function responseFormatter(req: Request, res: Response, next: NextFunction): void {
    res.success = (message: string | null = null, data: unknown = null, statusCode = 200) => {
        res.status(statusCode).json({
            status: true,
            message,
            timestamp: new Date().toISOString(),
            data,
        });
    };

    res.fail = (
        message: string | null = null,
        statusCode = 400,
        extras: Record<string, unknown> = {},
    ) => {
        res.status(statusCode).json({
            status: false,
            message,
            timestamp: new Date().toISOString(),
            route: req.originalUrl,
            data: null,
            ...extras,
        });
    };

    next();
}
