import { readdirSync, statSync, realpathSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { getConfig } from './config';

const MAX_ENV_BYTES = 200_000; // sane cap — this is a quick editor, not a file manager

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
}

export interface BrowseResult {
  success: boolean;
  root?: string;
  path?: string;      // relative path from root ('' for the root itself)
  absolutePath?: string;
  entries?: DirEntry[];
  error?: string;
}

// Resolves a browser-supplied relative path against the configured root and
// refuses to leave it — `..` segments, symlinks pointing outside, none of
// it escapes. The root itself must already be an absolute, symlink-resolved
// path (setProjectsRoot guarantees this), so a plain prefix check is safe.
function resolveWithinRoot(root: string, relPath: string): string | null {
  const candidate = join(root, relPath || '.');
  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    return null;
  }
  const rel = relative(root, real);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return real;
  return null;
}

export function browseProjects(relPath: string): BrowseResult {
  const { projectsRoot } = getConfig();
  if (!projectsRoot) return { success: false, error: 'No projects root configured yet' };

  const target = resolveWithinRoot(projectsRoot, relPath ?? '');
  if (!target) return { success: false, error: 'Path is outside the configured projects root' };

  let stat;
  try {
    stat = statSync(target);
  } catch {
    return { success: false, error: 'Path not found' };
  }
  if (!stat.isDirectory()) return { success: false, error: 'Not a directory' };

  const entries: DirEntry[] = [];
  try {
    for (const name of readdirSync(target)) {
      if (name.startsWith('.')) continue; // hide dotfiles/dotdirs — noise for a project picker
      try {
        const full = join(target, name);
        const s = statSync(full);
        entries.push({ name, isDirectory: s.isDirectory(), size: s.size, mtime: s.mtime.toISOString() });
      } catch {}
    }
  } catch {
    return { success: false, error: 'Could not read directory' };
  }

  entries.sort((a, b) => (a.isDirectory === b.isDirectory) ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1));

  return {
    success: true,
    root: projectsRoot,
    path: relative(projectsRoot, target),
    absolutePath: target,
    entries,
  };
}

// Validates a cwd for a new terminal session the same way — must resolve
// inside the configured root (once inside the shell itself, the user can
// `cd` anywhere; this only guards where a session is allowed to *start*).
export function resolveProjectPath(relPath: string): string | null {
  const { projectsRoot } = getConfig();
  if (!projectsRoot) return null;
  return resolveWithinRoot(projectsRoot, relPath ?? '');
}

// .env is deliberately excluded from the regular directory listing (it's a
// dotfile — noise for a project picker), but it's exactly what you want a
// one-click editor for, so it gets its own narrow read/write pair instead.
export function readEnvFile(relPath: string): { success: boolean; content?: string; error?: string } {
  const dir = resolveProjectPath(relPath);
  if (!dir) return { success: false, error: 'Invalid path' };
  try {
    const content = readFileSync(join(dir, '.env'), 'utf8');
    if (content.length > MAX_ENV_BYTES) return { success: false, error: '.env is too large to edit here' };
    return { success: true, content };
  } catch (e: any) {
    if (e.code === 'ENOENT') return { success: true, content: '' };
    return { success: false, error: e.message ?? 'Could not read .env' };
  }
}

export function writeEnvFile(relPath: string, content: string): { success: boolean; error?: string } {
  const dir = resolveProjectPath(relPath);
  if (!dir) return { success: false, error: 'Invalid path' };
  if (content.length > MAX_ENV_BYTES) return { success: false, error: '.env content too large' };
  try {
    writeFileSync(join(dir, '.env'), content, 'utf8');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Could not write .env' };
  }
}
