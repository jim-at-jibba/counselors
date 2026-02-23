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
  it('converts text to slug', () => {
    expect(generateSlug('should we use Redis for caching')).toBe(
      'should-we-use-redis-for-caching',
    );
  });

  it('strips special characters', () => {
    expect(generateSlug('What are the tradeoffs?')).toBe(
      'what-are-the-tradeoffs',
    );
  });

  it('truncates to max length', () => {
    const long =
      'this is a very long prompt that should be truncated to forty characters';
    const slug = generateSlug(long);
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it('handles empty string', () => {
    expect(generateSlug('')).toBe('untitled');
  });

  it('returns "untitled" for non-alphanumeric input', () => {
    expect(generateSlug('!!!')).toBe('untitled');
    expect(generateSlug('!@#$%')).toBe('untitled');
  });

  it('collapses multiple hyphens', () => {
    expect(generateSlug('hello   world---test')).toBe('hello-world-test');
  });
});

describe('generateSlugFromFile', () => {
  it('uses parent directory name', () => {
    expect(generateSlugFromFile('/path/to/redis-review/prompt.md')).toBe(
      'redis-review',
    );
  });

  it('falls back to filename when parent is dot', () => {
    expect(generateSlugFromFile('./prompt.md')).toBe('prompt');
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
