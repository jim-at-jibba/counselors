import { describe, expect, it } from 'vitest';
import { CopilotAdapter } from '../../src/adapters/copilot.js';
import { GeminiAdapter } from '../../src/adapters/gemini.js';
import { OpencodeAdapter } from '../../src/adapters/opencode.js';
import {
  capabilityNote,
  defaultCapabilities,
} from '../../src/core/capabilities.js';
import type { RunRequest } from '../../src/types.js';

const baseRequest: RunRequest = {
  prompt: 'test prompt',
  promptFilePath: '/tmp/prompt.md',
  toolId: 'test',
  outputDir: '/tmp/out',
  readOnlyPolicy: 'enforced',
  timeout: 540,
  cwd: '/tmp',
};

describe('capabilityNote', () => {
  it('warns agents off the shell when they have none', () => {
    const note = capabilityNote({ shell: 'none' });
    expect(note).toContain('no shell access');
    expect(note).toContain('git');
  });

  it('lists the permitted commands when git is scoped in', () => {
    const note = capabilityNote({ shell: 'readOnlyGit' });
    expect(note).toContain('git diff');
    expect(note).toContain('git status');
  });

  it('says nothing when the shell is unrestricted', () => {
    expect(capabilityNote({ shell: 'full' })).toBe('');
  });

  it('stays on one line so it can ride along a CLI instruction argument', () => {
    for (const shell of ['none', 'readOnlyGit', 'full'] as const) {
      expect(capabilityNote({ shell })).not.toContain('\n');
    }
  });
});

describe('defaultCapabilities', () => {
  it('assumes no shell under any read-only policy', () => {
    expect(defaultCapabilities('enforced').shell).toBe('none');
    expect(defaultCapabilities('bestEffort').shell).toBe('none');
  });

  it('assumes a full shell when read-only is off', () => {
    expect(defaultCapabilities('none').shell).toBe('full');
  });
});

describe('adapters that deny the shell outright', () => {
  it('tells gemini it has no shell', () => {
    const inv = new GeminiAdapter().buildInvocation(baseRequest);
    expect(inv.stdin).toContain('no shell access');
  });

  it('tells opencode it has no shell', () => {
    const inv = new OpencodeAdapter().buildInvocation(baseRequest);
    expect(inv.args.at(-1)).toContain('no shell access');
  });

  it('tells copilot it has no shell', () => {
    const inv = new CopilotAdapter().buildInvocation(baseRequest);
    expect(inv.args.at(-1)).toContain('no shell access');
  });
});
