import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { MAX_SLUG_LENGTH } from '../constants.js';

function secondsTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

/**
 * Generate a timestamped slug from prompt text.
 * Format: {seconds}-{slug}
 */
export function generateSlug(text: string): string {
  return `${secondsTimestamp()}-${slugify(text)}`;
}

/**
 * Generate a timestamped slug from a file path.
 * Uses the parent directory name if available, otherwise the filename.
 */
export function generateSlugFromFile(filePath: string): string {
  const dir = dirname(filePath);
  const dirName = basename(dir);
  // If parent dir has a meaningful name (not . or empty), use it
  if (dirName && dirName !== '.' && dirName !== '..') {
    return `${secondsTimestamp()}-${slugify(dirName)}`;
  }
  return `${secondsTimestamp()}-${slugify(basename(filePath, '.md'))}`;
}

/**
 * Resolve output directory, appending timestamp if exists.
 */
export function resolveOutputDir(baseDir: string, slug: string): string {
  let outputDir = join(baseDir, slug);
  try {
    mkdirSync(outputDir, { recursive: false });
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      outputDir = `${outputDir}-${Date.now()}`;
      mkdirSync(outputDir, { recursive: true });
    } else {
      // Parent dirs may not exist yet
      mkdirSync(outputDir, { recursive: true });
    }
  }
  return outputDir;
}

/**
 * Build the standard prompt template wrapping user's inline prompt.
 */
export function buildPrompt(question: string, context?: string): string {
  const parts: string[] = [
    '# Second Opinion Request',
    '',
    '## Question',
    question,
    '',
  ];

  if (context) {
    parts.push('## Context', '', context, '');
  }

  parts.push(
    '## Instructions',
    'You are providing an independent second opinion. Be critical and thorough.',
    '- Analyze the question in the context provided',
    '- Identify risks, tradeoffs, and blind spots',
    '- Suggest alternatives if you see better approaches',
    "- Be direct and opinionated — don't hedge",
    '- Structure your response with clear headings',
    '- Keep your response focused and actionable',
    '',
  );

  return parts.join('\n');
}
