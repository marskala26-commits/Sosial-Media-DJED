import crypto from 'crypto';
import type { WorkspaceMode } from '../src/types.ts';

// Keep signing secret in server memory if SESSION_SECRET is unset
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export interface SessionPayload {
  userId: string;
  workspace: WorkspaceMode;
  exp: number;
}

export interface MediaTokenPayload {
  fileId: string;
  userId: string;
  workspace: WorkspaceMode;
  purpose: 'preview';
  exp: number;
}

function signPayload(payloadObj: object): string {
  const encoded = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySignedToken<T>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T & {
      exp?: number;
    };
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string, workspace: WorkspaceMode): string {
  const payload: SessionPayload = {
    userId,
    workspace,
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
  };
  return signPayload(payload);
}

export function verifySessionToken(token: string): SessionPayload | null {
  const payload = verifySignedToken<SessionPayload>(token);
  if (!payload || !payload.userId) return null;
  if (payload.workspace !== 'prod' && payload.workspace !== 'demo') return null;
  return payload;
}

export function createMediaPreviewToken(
  fileId: string,
  userId: string,
  workspace: WorkspaceMode
): string {
  const payload: MediaTokenPayload = {
    fileId,
    userId,
    workspace,
    purpose: 'preview',
    exp: Date.now() + 15 * 60 * 1000, // 15 minutes
  };
  return signPayload(payload);
}

export function verifyMediaPreviewToken(token: string): MediaTokenPayload | null {
  const payload = verifySignedToken<MediaTokenPayload>(token);
  if (!payload || payload.purpose !== 'preview') return null;
  if (!payload.fileId || !payload.userId) return null;
  if (payload.workspace !== 'prod' && payload.workspace !== 'demo') return null;
  return payload;
}
