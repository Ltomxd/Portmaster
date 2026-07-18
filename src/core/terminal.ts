import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

// A login shell so PATH/aliases/nvm-style profile setup match what a real
// WSL terminal window would give the user — this is meant to feel like
// "just open a normal Ubuntu terminal here", not a stripped-down sandbox.
const SHELL = process.env.SHELL || '/bin/bash';

// Cap how much raw output we keep around to replay into a reattaching
// client — a shell that's been running `pnpm run dev` for an hour
// shouldn't grow this without bound.
const MAX_BUFFER_CHARS = 200_000;

export interface ShellSession {
  cwd: string;
  proc: IPty;
  buffer: string;
  cols: number;
  rows: number;
  createdAt: string;
}

// Keyed by resolved absolute cwd — one persistent shell per folder. The PTY
// outlives any single WebSocket: closing the terminal viewer (tab, minimize,
// full page reload) only drops that *connection*, never the process. That's
// the whole point — if you're running `pnpm run dev` in there, closing the
// dialog must not kill it. Reopening the same folder reattaches to the same
// shell and replays what it missed; only an explicit stop ends it.
const sessions = new Map<string, ShellSession>();

export function getOrCreateShell(cwd: string, cols = 80, rows = 24): { session: ShellSession; isNew: boolean } {
  const existing = sessions.get(cwd);
  if (existing) return { session: existing, isNew: false };

  const proc = pty.spawn(SHELL, ['-l'], {
    name: 'xterm-256color',
    cols: Math.max(1, cols),
    rows: Math.max(1, rows),
    cwd,
    env: process.env as { [key: string]: string },
  });

  const session: ShellSession = { cwd, proc, buffer: '', cols, rows, createdAt: new Date().toISOString() };
  proc.onData(data => {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER_CHARS) session.buffer = session.buffer.slice(-MAX_BUFFER_CHARS);
  });
  proc.onExit(() => sessions.delete(cwd));
  sessions.set(cwd, session);
  return { session, isNew: true };
}

export function getShellSession(cwd: string): ShellSession | undefined {
  return sessions.get(cwd);
}

export function killShellSession(cwd: string): boolean {
  const session = sessions.get(cwd);
  if (!session) return false;
  try { session.proc.kill(); } catch {}
  sessions.delete(cwd);
  return true;
}

export function listActiveShellPaths(): string[] {
  return [...sessions.keys()];
}
