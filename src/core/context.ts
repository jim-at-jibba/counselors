import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_MAX_CONTEXT_KB } from '../constants.js';
import { debug } from '../ui/logger.js';

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
): string {
  const parts: string[] = [];
  let totalBytes = 0;
  const maxBytes = maxKb * 1024;

  // Read specified files first (user-requested content gets priority)
  if (paths.length > 0) {
    parts.push('### Files Referenced', '');

    for (const p of paths) {
      if (totalBytes >= maxBytes) {
        debug(`Context limit reached (${maxKb}KB), skipping remaining files`);
        break;
      }

      const fullPath = resolve(cwd, p);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;
        if (stat.size > maxBytes - totalBytes) {
          debug(`Skipping ${p} — too large (${stat.size} bytes)`);
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

  // Git diff (staged + unstaged) — added after files, truncated if over budget
  if (totalBytes < maxBytes) {
    const diff = getGitDiff(cwd);
    if (diff) {
      const diffBytes = Buffer.byteLength(diff);
      if (totalBytes + diffBytes <= maxBytes) {
        const fence = safeFence(diff);
        parts.push(
          '### Recent Changes (Git Diff)',
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
        parts.push(
          '### Recent Changes (Git Diff) [truncated]',
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

function getGitDiff(cwd: string): string | null {
  try {
    const staged = execFileSync('git', ['diff', '--staged'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const unstaged = execFileSync('git', ['diff'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const parts = [];
    if (staged) parts.push(staged);
    if (unstaged) parts.push(unstaged);
    return parts.length > 0 ? parts.join('\n') : null;
  } catch {
    return null;
  }
}
