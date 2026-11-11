import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { pinoHttp } from 'pino-http';

import logger from '../../utils/logger.js';

export const requestLogger = pinoHttp({
    logger,
    genReqId: (req: IncomingMessage) => (req.headers['x-request-id'] as string) || randomUUID(),
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    },
    customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
        `${req.method ?? 'GET'} ${req.url ?? '/'} ${res.statusCode}`,
    customErrorMessage: (req: IncomingMessage, _res: ServerResponse, err: Error) =>
        `${req.method ?? 'GET'} ${req.url ?? '/'} error: ${err.message}`,
    serializers: {
        req(req: IncomingMessage & { id?: string; query?: unknown }) {
            return {
                id: req.id,
                method: req.method,
                url: req.url,
                query: req.query,
                headers: {
                    host: req.headers.host,
                    'user-agent': req.headers['user-agent'],
                },
            };
        },
        res(res: ServerResponse) {
            return {
                statusCode: res.statusCode,
            };
        },
    },
});

export default requestLogger;
