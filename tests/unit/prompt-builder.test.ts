import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPrompt,
  generateSlug,
  generateSlugFromFile,
  resolveOutputDir,
} from '../../src/core/prompt-builder.js';

const testDir = join(tmpdir(), `counselors-pb-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('generateSlug', () => {
  it('converts text to timestamped slug', () => {
    const slug = generateSlug('should we use Redis for caching');
    expect(slug).toMatch(/^\d+-should-we-use-redis-for-caching$/);
  });

  it('uses seconds-level timestamp', () => {
    const before = Math.floor(Date.now() / 1000);
    const slug = generateSlug('test');
    const after = Math.floor(Date.now() / 1000);
    const ts = Number(slug.split('-')[0]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('strips special characters', () => {
    const slug = generateSlug('What are the tradeoffs?');
    expect(slug).toMatch(/^\d+-what-are-the-tradeoffs$/);
  });

  it('truncates slug portion to max length', () => {
    const long =
      'this is a very long prompt that should be truncated to forty characters';
    const slug = generateSlug(long);
    // Slug portion (after timestamp-) should be <= 40 chars
    const slugPart = slug.replace(/^\d+-/, '');
    expect(slugPart.length).toBeLessThanOrEqual(40);
  });

  it('handles empty string', () => {
    const slug = generateSlug('');
    expect(slug).toMatch(/^\d+-untitled$/);
  });

  it('returns "untitled" for non-alphanumeric input', () => {
    expect(generateSlug('!!!')).toMatch(/^\d+-untitled$/);
    expect(generateSlug('!@#$%')).toMatch(/^\d+-untitled$/);
  });

  it('collapses multiple hyphens', () => {
    const slug = generateSlug('hello   world---test');
    expect(slug).toMatch(/^\d+-hello-world-test$/);
  });

  it('does not end with a trailing dash', () => {
    const slug = generateSlug(
      'When navigating between tabs, the frames per second drops.',
    );
    expect(slug).not.toMatch(/-$/);
    expect(slug).not.toMatch(/--/);
  });
});

describe('generateSlugFromFile', () => {
  it('uses parent directory name', () => {
    const slug = generateSlugFromFile('/path/to/redis-review/prompt.md');
    expect(slug).toMatch(/^\d+-redis-review$/);
  });

  it('falls back to filename when parent is dot', () => {
    const slug = generateSlugFromFile('./prompt.md');
    expect(slug).toMatch(/^\d+-prompt$/);
  });
});

describe('buildPrompt', () => {
  it('wraps question in template', () => {
    const prompt = buildPrompt('Is Redis good for caching?');
    expect(prompt).toContain('# Second Opinion Request');
    expect(prompt).toContain('Is Redis good for caching?');
    expect(prompt).toContain('## Instructions');
  });

  it('includes context when provided', () => {
    const prompt = buildPrompt('Review this', 'some context here');
    expect(prompt).toContain('## Context');
    expect(prompt).toContain('some context here');
  });

  it('omits context section when not provided', () => {
    const prompt = buildPrompt('Review this');
    expect(prompt).not.toContain('## Context');
  });
});

describe('resolveOutputDir', () => {
  it('creates a new directory', () => {
    const dir = resolveOutputDir(testDir, 'new-slug');
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain('new-slug');
  });

  it('appends timestamp when directory already exists', () => {
    // Create the dir first
    const existing = join(testDir, 'existing-slug');
    mkdirSync(existing);

    const dir = resolveOutputDir(testDir, 'existing-slug');
    expect(existsSync(dir)).toBe(true);
    expect(dir).not.toBe(existing);
    expect(dir).toContain('existing-slug-');
  });

  it('creates parent directories when needed', () => {
    const dir = resolveOutputDir(join(testDir, 'deep', 'nested'), 'slug');
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain('slug');
  });
});
