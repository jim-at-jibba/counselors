import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gatherContext, truncateUtf8 } from '../../src/core/context.js';

const testDir = join(tmpdir(), `counselors-ctx-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('gatherContext', () => {
  it('includes file content', () => {
    writeFileSync(join(testDir, 'file.txt'), 'hello world');
    const ctx = gatherContext(testDir, ['file.txt']);
    expect(ctx).toContain('hello world');
    expect(ctx).toContain('### Files Referenced');
  });

  it('respects maxKb budget — skips files that exceed remaining budget', () => {
    // Create a 2KB file
    const largeContent = 'x'.repeat(2048);
    writeFileSync(join(testDir, 'large.txt'), largeContent);

    // With 1KB budget, the file should be skipped
    const ctx = gatherContext(testDir, ['large.txt'], 1);
    expect(ctx).not.toContain(largeContent);
  });

  it('truncates git diff when over budget', () => {
    // This test works in the counselors project dir which is a git repo with no commits
    // gatherContext calls getGitDiff internally — in a dir with no git, diff returns null
    // So we test budget enforcement with files filling the budget
    const content = 'a'.repeat(512);
    writeFileSync(join(testDir, 'a.txt'), content);

    // 1KB budget, file takes ~512 bytes, any diff would be truncated
    const ctx = gatherContext(testDir, ['a.txt'], 1);
    expect(ctx).toContain('a.txt');
    // Git diff section should not appear (no git repo in tmpdir)
    expect(ctx).not.toContain('Git Diff');
  });

  it('handles nonexistent files gracefully', () => {
    const ctx = gatherContext(testDir, ['does-not-exist.txt']);
    // Should not throw, just skip
    expect(ctx).toContain('### Files Referenced');
    expect(ctx).not.toContain('does-not-exist.txt content');
  });

  it('handles directories in file list gracefully', () => {
    mkdirSync(join(testDir, 'subdir'));
    const ctx = gatherContext(testDir, ['subdir']);
    // Should skip non-files without error
    expect(ctx).not.toContain('```\n\n```');
  });

  it('stops adding files after budget is exhausted', () => {
    writeFileSync(join(testDir, 'first.txt'), 'a'.repeat(600));
    writeFileSync(join(testDir, 'second.txt'), 'b'.repeat(600));

    // 1KB budget — first file fits (~600 bytes), second should be skipped
    const ctx = gatherContext(testDir, ['first.txt', 'second.txt'], 1);
    expect(ctx).toContain('first.txt');
    // second.txt has 600 bytes which exceeds remaining budget
    expect(ctx).not.toContain('bbbbb');
  });

  it('uses extended fence when file contains triple backticks', () => {
    const content = 'some code\n```\ninner block\n```\nmore code';
    writeFileSync(join(testDir, 'fenced.txt'), content);
    const ctx = gatherContext(testDir, ['fenced.txt']);
    // Should use at least 4 backticks to avoid conflict
    expect(ctx).toContain('````');
    expect(ctx).toContain(content);
  });
});

describe('truncateUtf8', () => {
  it('returns string unchanged when within budget', () => {
    expect(truncateUtf8('hello', 100)).toBe('hello');
  });

  it('truncates ASCII cleanly', () => {
    expect(truncateUtf8('hello world', 5)).toBe('hello');
  });

  it('does not split multi-byte emoji', () => {
    // 😀 is a 4-byte character (U+1F600)
    const emoji = '😀😀😀';
    const result = truncateUtf8(emoji, 6);
    // 6 bytes can only fit one 4-byte emoji cleanly
    expect(result).toBe('😀');
    expect(result).not.toContain('\uFFFD');
  });

  it('does not produce replacement characters on 2-byte chars', () => {
    // é is a 2-byte character in UTF-8
    const str = 'café';
    // 'caf' = 3 bytes, 'é' = 2 bytes = 5 total
    const result = truncateUtf8(str, 4);
    expect(result).toBe('caf');
    expect(result).not.toContain('\uFFFD');
  });

  it('does not split 3-byte CJK characters', () => {
    // 你 is a 3-byte character in UTF-8 (U+4F60)
    const str = '你好世界';
    // Each char is 3 bytes = 12 total
    const result = truncateUtf8(str, 7);
    // 7 bytes fits two 3-byte chars (6 bytes), not a partial third
    expect(result).toBe('你好');
    expect(result).not.toContain('\uFFFD');
  });

  it('returns empty string when maxBytes is 0', () => {
    expect(truncateUtf8('hello', 0)).toBe('');
  });
});
