import { randomBytes } from 'crypto';

export const SESSION_COOKIE = 'portmaster_session';

// In-memory on purpose — a restart requiring everyone to log in again is a
// perfectly fine tradeoff for a single-user local dashboard, and it avoids
// persisting session secrets to disk.
const sessions = new Set<string>();

export function createSession(): string {
  const token = randomBytes(32).toString('hex');
  sessions.add(token);
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  return !!token && sessions.has(token);
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
