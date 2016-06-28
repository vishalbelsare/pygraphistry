import crypto from 'crypto';

export function createID() {
    return crypto.randomBytes(8).toString('hex');
}

