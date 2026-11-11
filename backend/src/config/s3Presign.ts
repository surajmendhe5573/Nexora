import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { config } from './env.js';
import s3Client from './s3.js';

const EXPIRY_SECONDS = 15 * 60; // 15 minutes (900 seconds)

export async function generatePresignedUrl(
    s3Key: string,
    options: { fileName?: string; contentType?: string; expiresIn?: number } = {},
): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: config.AWS_S3_BUCKET,
        Key: s3Key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: options.fileName
            ? `attachment; filename*=UTF-8''${encodeURIComponent(options.fileName)}`
            : undefined,
    });

    return getSignedUrl(s3Client, command, { expiresIn: options.expiresIn ?? EXPIRY_SECONDS });
}
