import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export default function validate(schema: ZodType) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body ?? {});

        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            res.fail('Validation failed', 400, { errors });
            return;
        }

        req.body = result.data;
        next();
    };
}
