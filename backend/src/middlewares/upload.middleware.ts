import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

type UploadHandler = (req: Request, res: Response, cb: (err?: unknown) => void) => void;

function runUpload(handler: UploadHandler, maxBytes: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
        handler(req, res, (err?: unknown) => {
            if (!err) return next();

            if (err instanceof multer.MulterError) {
                const tooBig = err.code === 'LIMIT_FILE_SIZE';
                const message = tooBig
                    ? `File is too large (max ${maxBytes / 1024 / 1024} MB per file)`
                    : 'Invalid upload: too many files or an unexpected file field';
                return next(Object.assign(new Error(message), { statusCode: tooBig ? 413 : 400 }));
            }
            return next(err);
        });
    };
}

export function uploadSingle(fieldName = 'file', maxBytes = MAX_FILE_BYTES) {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxBytes, files: 1 },
    });
    return runUpload(upload.single(fieldName) as UploadHandler, maxBytes);
}

// Several named file fields, e.g. [{ name: 'documents', maxCount: 5 }, { name: 'photo', maxCount: 1 }]
export function uploadFields(
    fields: { name: string; maxCount: number }[],
    maxBytes = MAX_FILE_BYTES,
) {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxBytes, files: fields.reduce((n, f) => n + f.maxCount, 0) },
    });
    return runUpload(upload.fields(fields) as UploadHandler, maxBytes);
}
