import jwt from 'jsonwebtoken';

interface TokenPayload {
    userId?: string;
    clientId?: string;
    // Add any other claims you need
}

export function generateToken(payload: TokenPayload = {}): string {
    const secret = process.env.JWT_SECRET || 'default-secret';

    // Default to 1 hour expiration if not specified
    const options: jwt.SignOptions = {
        expiresIn: '1h'
    };

    return jwt.sign(payload, secret, options);
}

export function verifyToken(token: string): TokenPayload {
    const secret = process.env.JWT_SECRET || 'default-secret';
    return jwt.verify(token, secret) as TokenPayload;
}