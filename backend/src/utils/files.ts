export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
    if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
        return { mime: 'application/pdf', ext: 'pdf' };
    }
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return { mime: 'image/jpeg', ext: 'jpg' };
    }
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buf.length >= 8 && png.every((byte, i) => buf[i] === byte)) {
        return { mime: 'image/png', ext: 'png' };
    }
    return null;
}

// Display name only: S3 keys never use it
export function cleanFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? '';
    const cleaned = base.replace(/[^\w.\- ()]/g, '_').slice(-120);
    return cleaned || 'file';
}
