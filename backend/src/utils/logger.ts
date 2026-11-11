import pino, { type Logger } from 'pino';

import { config } from '../config/env.js';

const isDev = config.NODE_ENV !== 'production';

export const logger: Logger = pino({
    level: config.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    base: isDev ? undefined : { env: config.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: isDev
        ? {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  translateTime: 'yyyy-mm-dd HH:MM:ss.l',
                  ignore: 'pid,hostname',
              },
          }
        : undefined,
});

export default logger;
