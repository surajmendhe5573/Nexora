import 'dotenv/config';

import { config } from './config/env.js';
import logger from './utils/logger.js';
import app from './app.js';

const PORT = config.PORT || process.env.PORT || 5001;

const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT} in ${config.NODE_ENV} mode`);
});

// Process-level unhandled rejection & uncaught exception handling
process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'Unhandled Rejection detected');
});

process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err }, 'Uncaught Exception detected! Terminating process...');
    process.exit(1);
});

const gracefulShutdown = (signal: string): void => {
    logger.info(`${signal} received, closing HTTP server gracefully...`);
    server.close(() => {
        logger.info('HTTP server closed. Exiting process.');
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
