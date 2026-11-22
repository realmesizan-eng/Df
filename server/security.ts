import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const KEY_PEPPER = process.env.LICENSE_PEPPER || 'zentrix-v1-key-digest';

export interface AuthPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, original);
}

export function timingSafeComparePlain(a: string, b: string): boolean {
  const aHash = crypto.createHash('sha256').update(a).digest();
  const bHash = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

export function hashLicenseKey(rawKey: string): string {
  const normalized = rawKey.trim().toUpperCase();
  return crypto.createHmac('sha256', KEY_PEPPER).update(normalized).digest('hex');
}

export function hashDeviceId(rawDeviceId: string): string {
  const normalized = rawDeviceId.trim().toLowerCase();
  return crypto.createHmac('sha256', KEY_PEPPER).update(`dev:${normalized}`).digest('hex');
}

export function generateLicenseKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    for (let i = 0; i < 4; i++) {
      seg += alphabet[bytes[s * 4 + i] % alphabet.length];
    }
    segments.push(seg);
  }
  const rawKey = `ZTX-${segments.join('-')}`;
  const keyPrefix = `ZTX-${segments[0]}-****-****-${segments[3]}`;
  const keyHash = hashLicenseKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signToken(payload: Omit<AuthPayload, 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const fullPayload: AuthPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const decoded = JSON.parse(base64UrlDecode(payloadB64)) as AuthPayload;
    if (!decoded || typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (decoded.role !== 'user' && decoded.role !== 'admin') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Simple in-memory sliding-window rate limiter
const rateBuckets = new Map<string, number[]>();

export function rateLimit(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (rateBuckets.get(key) || []).filter((t) => t > cutoff);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
      });
      return;
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

export function requireAuth(role: 'user' | 'admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const token = header.slice(7).trim();
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired or invalid token.' });
      return;
    }
    if (payload.role !== role) {
      res.status(403).json({ error: 'Insufficient permissions for this action.' });
      return;
    }
    (req as Request & { auth?: AuthPayload }).auth = payload;
    next();
  };
}
