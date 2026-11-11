import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

interface RateLimiterOptions {
    windowMs?: number;
    max?: number;
    message?: string;
}

const rateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
}: RateLimiterOptions = {}): RequestHandler => {
    return rateLimit({
        windowMs,
        max,
        // Remove standardHeaders / legacyHeaders if type complains
        handler: (req, res) => {
            res.status(429).json({ status: 429, message });
        },
    });
};

export default rateLimiter;
