import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { synthesize, synthesizeFinal } from '../../src/core/synthesis.js';
import type { RoundManifest, RunManifest } from '../../src/types.js';

describe('synthesis', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = join(tmpdir(), `counselors-synthesis-test-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('reads output file using sanitized tool ID', () => {
    // Dispatcher writes files with sanitized IDs
    const sanitizedName = 'codex-5.3-xhigh';
    writeFileSync(
      join(outputDir, `${sanitizedName}.md`),
      '# Overview\n\nSome content\n\n## Details\n\nMore content\n',
    );

    const manifest: RunManifest = {
      timestamp: new Date().toISOString(),
      slug: 'test',
      prompt: 'test prompt',
      promptSource: 'inline',
      readOnlyPolicy: 'bestEffort',
      tools: [
        {
          toolId: 'codex-5.3-xhigh',
          status: 'success',
          exitCode: 0,
          durationMs: 1000,
          wordCount: 10,
          outputFile: join(outputDir, `${sanitizedName}.md`),
          stderrFile: join(outputDir, `${sanitizedName}.stderr`),
        },
      ],
    };

    const summary = synthesize(manifest, outputDir);
    expect(summary).toContain('Overview');
    expect(summary).toContain('Details');
  });

  it('handles tool IDs with special characters via sanitization', () => {
    // A toolId with chars that get replaced by sanitizeId
    const toolId = 'tool/with:special@chars';
    const sanitizedName = 'tool_with_special_chars';
    writeFileSync(
      join(outputDir, `${sanitizedName}.md`),
      '# Found It\n\nContent here\n',
    );

    const manifest: RunManifest = {
      timestamp: new Date().toISOString(),
      slug: 'test',
      prompt: 'test prompt',
      promptSource: 'inline',
      readOnlyPolicy: 'bestEffort',
      tools: [
        {
          toolId,
          status: 'success',
          exitCode: 0,
          durationMs: 500,
          wordCount: 5,
          outputFile: join(outputDir, `${sanitizedName}.md`),
          stderrFile: join(outputDir, `${sanitizedName}.stderr`),
        },
      ],
    };

    const summary = synthesize(manifest, outputDir);
    expect(summary).toContain('Found It');
  });

  it('prefers report.outputFile over reconstructed path', () => {
    // Write the file to a non-standard location (not derived from toolId)
    const customPath = join(outputDir, 'custom-location.md');
    writeFileSync(customPath, '# From Custom Path\n\nCustom content\n');

    // Also write a file at the reconstructed path — should NOT be used
    writeFileSync(
      join(outputDir, 'my-tool.md'),
      '# From Reconstructed\n\nWrong content\n',
    );

    const manifest: RunManifest = {
      timestamp: new Date().toISOString(),
      slug: 'test',
      prompt: 'test prompt',
      promptSource: 'inline',
      readOnlyPolicy: 'bestEffort',
      tools: [
        {
          toolId: 'my-tool',
          status: 'success',
          exitCode: 0,
          durationMs: 500,
          wordCount: 5,
          outputFile: customPath,
          stderrFile: '',
        },
      ],
    };

    const summary = synthesize(manifest, outputDir);
    expect(summary).toContain('From Custom Path');
    expect(summary).not.toContain('From Reconstructed');
  });

  it('falls back to reconstructed path when outputFile is empty', () => {
    writeFileSync(
      join(outputDir, 'fallback-tool.md'),
      '# Fallback Headings\n\nContent\n',
    );

    const manifest: RunManifest = {
      timestamp: new Date().toISOString(),
      slug: 'test',
      prompt: 'test',
      promptSource: 'inline',
      readOnlyPolicy: 'bestEffort',
      tools: [
        {
          toolId: 'fallback-tool',
          status: 'success',
          exitCode: 0,
          durationMs: 100,
          wordCount: 3,
          outputFile: '',
          stderrFile: '',
        },
      ],
    };

    const summary = synthesize(manifest, outputDir);
    expect(summary).toContain('Fallback Headings');
  });
});

describe('synthesizeFinal', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = join(tmpdir(), `counselors-synth-final-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('uses report.outputFile for multi-round headings', () => {
    const roundDir = join(outputDir, 'round-1');
    mkdirSync(roundDir, { recursive: true });

    const customPath = join(roundDir, 'custom-output.md');
    writeFileSync(customPath, '# Round One Finding\n\nDetails\n');

    const rounds: RoundManifest[] = [
      {
        round: 1,
        timestamp: new Date().toISOString(),
        tools: [
          {
            toolId: 'my-tool',
            status: 'success',
            exitCode: 0,
            durationMs: 1000,
            wordCount: 10,
            outputFile: customPath,
            stderrFile: '',
          },
        ],
      },
    ];

    const result = synthesizeFinal(rounds, outputDir);
    expect(result).toContain('Round One Finding');
  });
});
