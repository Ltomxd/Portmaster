import { readdirSync, statSync, realpathSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { getConfig } from './config';

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
