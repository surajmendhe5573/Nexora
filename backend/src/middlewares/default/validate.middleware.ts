import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';

export const validate =
    (schema: ZodType) =>
    (req: Request, res: Response, next: NextFunction): void => {
        try {
            schema.parse({
                body: req.body,
                params: req.params,
                query: req.query,
            });

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                res.status(400).json({
                    status: false,
                    message: 'Validation failed',
                    errors: error.issues.map((issue) => ({
                        field: issue.path.join('.'),
                        message: issue.message,
                    })),
                    data: null,
                });

                return;
            }

            next(error);
        }
    };
