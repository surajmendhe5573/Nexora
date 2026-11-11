import { Response } from 'express';

import { ResponseResult } from '../types/global.js';

export type { ResponseResult };

interface ExtendedError extends Error {
    data?: unknown;
    statusCode?: number;
    status?: string;
    isOperational?: boolean;
    stack?: string;
}

export const sendSuccessResponse = (
    res: Response,
    message: string = 'Success',
    data: unknown[] | object = [],
    successCode: number = 200,
): Response => {
    return res.status(successCode).json({
        status: 'success',
        message,
        data,
    });
};

export const sendErrorResponse = (
    res: Response,
    message: string = 'Error',
    statusCode: number = 500,
): Response => {
    return res.status(statusCode).json({
        status: 'error',
        message,
    });
};

export const sendValidationError = (
    res: Response,
    errors: unknown[] | object = [],
    message: string = 'Validation failed',
): Response => {
    return res.status(400).json({
        status: 'fail',
        message,
        errors, // Include specific validation errors
    });
};

// For development: show full stack trace
export const sendDevelopmentError = (res: Response, error: ExtendedError): Response => {
    const statusCode = error.statusCode || 500;
    const message = error.message;
    const stack = error.stack;
    const status = error.status || 'error';
    const data = error.data || {};

    return res.status(statusCode).json({
        status,
        message,
        stack,
        error, // Include raw error for debugging
        data,
    });
};

// For production: avoid leaking details unless it's an operational error
export const sendProductionError = (res: Response, error: ExtendedError): Response => {
    const statusCode = error.statusCode || 500;
    const status = error.status || 'error';
    const data = error.data || {};

    // Log unexpected errors
    console.error('ERROR 💥:', error.name, error.message, error.stack);

    if (error.isOperational) {
        return res.status(statusCode).json({
            status,
            message: error.message,
            error: {}, // Don't leak error details
            data,
        });
    }

    // Send generic message
    return res.status(500).json({
        status: 'error',
        message: 'Something went wrong! Please try again later.',
        error: {}, // Don't leak error details
        data,
    });
};

export const sendSuccess = (
    message: string = 'Success',
    data: unknown[] | object = [],
): ResponseResult => {
    return { status: 'success', message, data };
};

export const sendError = (
    message: string = 'Error',
    data: unknown[] | object = [],
): ResponseResult => {
    return { status: 'error', message, data };
};
