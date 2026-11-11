import 'dotenv/config';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';

import { config } from './config/env.js';
import errorHandler from './middlewares/default/errorHandler.js';
import notFound from './middlewares/default/notFound.js';
import requestLogger from './middlewares/default/requestLogger.js';
import { responseFormatter } from './middlewares/default/responseFormatter.js';

const app = express();

if (config.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(helmet());
app.use(requestLogger);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || config.allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(
                    Object.assign(new Error('Origin not allowed by CORS'), { statusCode: 403 }),
                );
            }
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
    }),
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(compression());
app.use(responseFormatter);

app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'UP',
        service: 'Nexora-backend-api',
        timestamp: new Date().toISOString(),
    });
});

app.get('/', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'UP',
        message: 'Nexora – Multi-Tenant SaaS Management Platform',
        service: 'Nexora-backend-api',
        timestamp: new Date().toISOString(),
    });
});

app.use(notFound);
app.use(errorHandler);

export default app;
