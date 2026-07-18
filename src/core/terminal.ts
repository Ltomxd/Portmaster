import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import { execFileSync } from 'child_process';

// A login shell so PATH/aliases/nvm-style profile setup match what a real
// WSL terminal window would give the user — this is meant to feel like
// "just open a normal Ubuntu terminal here", not a stripped-down sandbox.
const SHELL = process.env.SHELL || '/bin/bash';

// Every session is a detached tmux session, one per folder — a real,
// independent process tree that answers to nothing but tmux itself. A
// node-pty PTY spawned directly (the original design here) is a child of
// *this* Node process: closing its master fd — which the kernel does
// automatically the instant this process exits, for any reason (a crash,
// `pm2 restart`, a redeploy) — sends SIGHUP to the shell and everything
// running in its foreground (`pnpm run dev` included). That defeated the
// entire point of persistence, since it meant a routine dashboard restart
// silently killed every open terminal. tmux sidesteps this completely: we
// only ever attach a disposable client PTY to a session that lives on its
// own, so tearing down this dashboard (or this browser tab, same as
// before) never touches what's actually running inside.
const SESSION_PREFIX = 'portmaster_';

function tmuxSessionName(cwd: string): string {
  return SESSION_PREFIX + Buffer.from(cwd, 'utf8').toString('base64url');
}

function cwdFromSessionName(name: string): string | null {
  if (!name.startsWith(SESSION_PREFIX)) return null;
  try { return Buffer.from(name.slice(SESSION_PREFIX.length), 'base64url').toString('utf8'); }
  catch { return null; }
}

function tmuxHasSession(name: string): boolean {
  try { execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

export function isTmuxAvailable(): boolean {
  try { execFileSync('tmux', ['-V'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// Attaching is cheap and disposable — every call spawns a fresh attach
// client (tmux happily mirrors a session across multiple simultaneous
// attaches), so there's no in-memory bookkeeping to keep straight across a
// server restart. `isNew` tells the caller whether they just created the
// underlying session or are joining one already running.
export function attachShell(cwd: string, cols = 80, rows = 24): { proc: IPty; isNew: boolean } {
  const name = tmuxSessionName(cwd);
  const isNew = !tmuxHasSession(name);
  if (isNew) {
    execFileSync('tmux', [
      'new-session', '-d', '-s', name,
      '-x', String(Math.max(1, cols)), '-y', String(Math.max(1, rows)),
      '-c', cwd, SHELL, '-l',
    ], { stdio: 'ignore' });
    // Portmaster's own panel already shows the folder + status — tmux's
    // status line would just duplicate that at the bottom of every session.
    try { execFileSync('tmux', ['set-option', '-t', name, 'status', 'off'], { stdio: 'ignore' }); } catch {}
  }
  const proc = pty.spawn('tmux', ['attach-session', '-t', name], {
    name: 'xterm-256color',
    cols: Math.max(1, cols),
    rows: Math.max(1, rows),
    cwd,
    env: process.env as { [key: string]: string },
  });
  return { proc, isNew };
}

export function killShellSession(cwd: string): boolean {
  const name = tmuxSessionName(cwd);
  if (!tmuxHasSession(name)) return false;
  try { execFileSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' }); } catch {}
  return true;
}

export function listActiveShellPaths(): string[] {
  try {
    const out = execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map(cwdFromSessionName).filter((c): c is string => c !== null);
  } catch {
    // `tmux list-sessions` exits non-zero when there are no sessions at all.
    return [];
  }
}
