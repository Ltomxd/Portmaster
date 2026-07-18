import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const AUDIT_DIR = join(homedir(), '.portmaster');
const AUDIT_PATH = join(AUDIT_DIR, 'audit.json');
const MAX_ENTRIES = 500; // a personal dev-machine log, not a compliance trail

export interface AuditEntry {
  timestamp: string;
  action: 'kill' | 'guard_kill' | 'adopt';
  port: number;
  process: string | null;
  detail?: string;
}

function ensureDir(): void {
  try { mkdirSync(AUDIT_DIR, { recursive: true }); } catch {}
}

export function appendAudit(entry: Omit<AuditEntry, 'timestamp'>): void {
  ensureDir();
  let list: AuditEntry[] = [];
  try { list = JSON.parse(readFileSync(AUDIT_PATH, 'utf8')); } catch {}
  list.push({ ...entry, timestamp: new Date().toISOString() });
  if (list.length > MAX_ENTRIES) list = list.slice(-MAX_ENTRIES);
  try { writeFileSync(AUDIT_PATH, JSON.stringify(list, null, 2)); } catch {}
}

export function getAuditLog(limit = 200): AuditEntry[] {
  try {
    const list: AuditEntry[] = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
    return list.slice(-limit).reverse(); // most recent first
  } catch {
    return [];
  }
}
