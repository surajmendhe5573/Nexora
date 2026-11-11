import { NextFunction, Request, Response } from 'express';

type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
type SyncFunction = (req: Request, res: Response, next: NextFunction) => unknown;

export const catchAsync = (fn: AsyncFunction) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        fn(req, res, next).catch((err: unknown) => {
            const error = err instanceof Error ? err : new Error('Unexpected error');
            next(error);
        });
    };
};

export const catchSync = (fn: SyncFunction) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            fn(req, res, next);
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unexpected error');
            next(error);
        }
    };
};
