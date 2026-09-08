import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gatherContext } from '../../src/core/context.js';

const repoDir = join(tmpdir(), `counselors-diff-test-${Date.now()}`);

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: repoDir, stdio: 'pipe' });
}

function write(name: string, content: string): void {
  writeFileSync(join(repoDir, name), content);
}

beforeEach(() => {
  mkdirSync(repoDir, { recursive: true });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  write('app.ts', 'export const version = 1;\n');
  git('add', '-A');
  git('commit', '-qm', 'initial');
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('gatherContext diff modes', () => {
  it('picks up uncommitted working-tree changes', () => {
    write('app.ts', 'export const version = 2;\n');

    const ctx = gatherContext(repoDir, [], 50, 'auto');
    expect(ctx).toContain('Working Tree');
    expect(ctx).toContain('version = 2');
  });

  it('falls back to the branch diff when the working tree is clean', () => {
    git('checkout', '-qb', 'feature');
    write('app.ts', 'export const version = 3;\n');
    git('add', '-A');
    git('commit', '-qm', 'bump version');

    const ctx = gatherContext(repoDir, [], 50, 'auto');
    expect(ctx).toContain('this branch vs main');
    expect(ctx).toContain('version = 3');
  });

  it('returns nothing when a clean branch has no commits over main', () => {
    git('checkout', '-qb', 'empty-branch');

    expect(gatherContext(repoDir, [], 50, 'auto')).toBe('');
  });

  it('ignores committed branch work when the mode is "working"', () => {
    git('checkout', '-qb', 'feature');
    write('app.ts', 'export const version = 4;\n');
    git('add', '-A');
    git('commit', '-qm', 'bump version');

    expect(gatherContext(repoDir, [], 50, 'working')).toBe('');
  });

  it('ignores uncommitted changes when the mode is "branch"', () => {
    git('checkout', '-qb', 'feature');
    write('app.ts', 'export const version = 5;\n');
    git('add', '-A');
    git('commit', '-qm', 'bump version');
    write('app.ts', 'export const version = 6;\n');

    const ctx = gatherContext(repoDir, [], 50, 'branch');
    expect(ctx).toContain('version = 5');
    expect(ctx).not.toContain('version = 6');
  });
});
