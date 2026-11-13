import 'dotenv/config';

import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'local', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(5000),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

    APP_URL: z.string().default('http://localhost:3000'),
    EMAIL_HOST: z.string().default('smtp.gmail.com'),
    EMAIL_PORT: z.coerce.number().default(587),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASS: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error));
    process.exit(1);
}

export const config = {
    ...parsed.data,
    allowedOrigins: parsed.data.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
};
