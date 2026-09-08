import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_MAX_CONTEXT_KB } from '../constants.js';
import { debug, warn } from '../ui/logger.js';

/**
 * Which diff to gather.
 *
 * - `working` — staged + unstaged changes only
 * - `branch`  — everything this branch adds over its merge base
 * - `auto`    — working-tree changes, falling back to the branch diff when the
 *               tree is clean (the common "my work is already committed" case)
 */
export type DiffMode = 'working' | 'branch' | 'auto';

/** Return a fence delimiter that doesn't conflict with the content. */
function safeFence(content: string): string {
  let fence = '```';
  while (content.includes(fence)) fence += '`';
  return fence;
}

/** Truncate a string to at most maxBytes of valid UTF-8 without splitting multi-byte characters. */
export function truncateUtf8(str: string, maxBytes: number): string {
  const buf = Buffer.from(str);
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  // Skip continuation bytes (10xxxxxx)
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  // If we're on a multi-byte lead byte, check if the full sequence fits
  if (end > 0) {
    const lead = buf[end - 1]!;
    const seqLen =
      (lead & 0xe0) === 0xc0
        ? 2
        : (lead & 0xf0) === 0xe0
          ? 3
          : (lead & 0xf8) === 0xf0
            ? 4
            : 1;
    if (end - 1 + seqLen > maxBytes) end--;
  }
  return buf.subarray(0, end).toString('utf-8');
}

/**
 * Gather context from git diff and specified files.
 */
export function gatherContext(
  cwd: string,
  paths: string[],
  maxKb: number = DEFAULT_MAX_CONTEXT_KB,
  diffMode: DiffMode = 'auto',
): string {
  const parts: string[] = [];
  let totalBytes = 0;
  const maxBytes = maxKb * 1024;

  // Read specified files first (user-requested content gets priority)
  if (paths.length > 0) {
    parts.push('### Files Referenced', '');

    for (const p of paths) {
      if (totalBytes >= maxBytes) {
        warn(
          `Context limit reached (${maxKb}KB) — skipping remaining referenced files. Raise defaults.maxContextKb to include them.`,
        );
        break;
      }

      const fullPath = resolve(cwd, p);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;
        if (stat.size > maxBytes - totalBytes) {
          warn(
            `Skipping ${p} — ${Math.ceil(stat.size / 1024)}KB exceeds the remaining ${maxKb}KB context budget.`,
          );
          continue;
        }

        const content = readFileSync(fullPath, 'utf-8');
        const fence = safeFence(content);
        parts.push(`#### ${p}`, '', fence, content, fence, '');
        totalBytes += Buffer.byteLength(content);
      } catch {
        debug(`Could not read ${p}`);
      }
    }
  }

  // Git diff — added after files, truncated if over budget
  if (totalBytes < maxBytes) {
    const gathered = getDiff(cwd, diffMode);
    if (gathered) {
      const { diff, label } = gathered;
      const diffBytes = Buffer.byteLength(diff);
      if (totalBytes + diffBytes <= maxBytes) {
        const fence = safeFence(diff);
        parts.push(
          `### Recent Changes (${label})`,
          '',
          `${fence}diff`,
          diff,
          fence,
          '',
        );
        totalBytes += diffBytes;
      } else {
        const remaining = maxBytes - totalBytes;
        const truncated = truncateUtf8(diff, remaining);
        const fence = safeFence(truncated);
        warn(
          `Diff truncated to fit the ${maxKb}KB context budget (${Math.ceil(diffBytes / 1024)}KB of changes). Raise defaults.maxContextKb or narrow the review scope.`,
        );
        parts.push(
          `### Recent Changes (${label}) [truncated]`,
          '',
          `${fence}diff`,
          truncated,
          fence,
          '',
        );
        totalBytes = maxBytes;
      }
    }
  }

  return parts.join('\n');
}

interface GatheredDiff {
  diff: string;
  label: string;
}

function getDiff(cwd: string, mode: DiffMode): GatheredDiff | null {
  if (mode === 'working') return getWorkingDiff(cwd);
  if (mode === 'branch') return getBranchDiff(cwd);
  return getWorkingDiff(cwd) ?? getBranchDiff(cwd);
}

/** Run git, returning trimmed stdout or null when the command fails. */
function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function getWorkingDiff(cwd: string): GatheredDiff | null {
  const staged = git(cwd, ['diff', '--staged']);
  const unstaged = git(cwd, ['diff']);

  const parts = [staged, unstaged].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;

  return { diff: parts.join('\n'), label: 'Git Diff — Working Tree' };
}

/**
 * Diff of everything HEAD adds over its merge base, so committed-but-unmerged
 * branch work is reviewable even when the working tree is clean.
 */
function getBranchDiff(cwd: string): GatheredDiff | null {
  const base = resolveBaseRef(cwd);
  if (!base) return null;

  const diff = git(cwd, ['diff', `${base}...HEAD`]);
  if (!diff) return null;

  return { diff, label: `Git Diff — this branch vs ${base}` };
}

/**
 * Pick the ref to diff the current branch against: its upstream if it has one,
 * otherwise the first conventional trunk that exists and isn't HEAD itself.
 */
function resolveBaseRef(cwd: string): string | null {
  const upstream = git(cwd, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  if (upstream) return upstream;

  const head = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    if (candidate === head) continue;
    if (git(cwd, ['rev-parse', '--verify', '--quiet', candidate])) {
      return candidate;
    }
  }
  return null;
}
