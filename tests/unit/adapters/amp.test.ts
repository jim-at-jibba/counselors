import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AmpAdapter,
  computeAmpCost,
  isAmpDeepMode,
  parseAmpUsage,
} from '../../../src/adapters/amp.js';
import type { RunRequest } from '../../../src/types.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => true) };
});

describe('AmpAdapter', () => {
  const adapter = new AmpAdapter();

  const baseRequest: RunRequest = {
    prompt: 'test prompt',
    promptFilePath: '/tmp/prompt.md',
    toolId: 'amp',
    outputDir: '/tmp/out',
    readOnlyPolicy: 'bestEffort',
    timeout: 540,
    cwd: '/tmp',
    extraFlags: ['-m', 'smart'],
  };

  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('has correct metadata', () => {
    expect(adapter.id).toBe('amp');
    expect(adapter.readOnly.level).toBe('enforced');
    expect(adapter.modelFlag).toBe('-m');
  });

  it('uses stdin for prompt delivery', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('amp');
    expect(inv.stdin).toBeTruthy();
    expect(inv.stdin).toContain('test prompt');
    expect(inv.stdin).toContain('oracle tool');
    expect(inv.args).toContain('-m');
    expect(inv.args).toContain('smart');
    expect(inv.args).toContain('-x');
  });

  it('uses req.binary when provided', () => {
    const req = { ...baseRequest, binary: '/custom/path/amp' };
    const inv = adapter.buildInvocation(req);
    expect(inv.cmd).toBe('/custom/path/amp');
  });

  it('falls back to "amp" when req.binary is undefined', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('amp');
  });

  it('uses deep settings file for deep model', () => {
    const req = { ...baseRequest, extraFlags: ['-m', 'deep'] };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).toContain('--settings-file');
    const settingsIdx = inv.args.indexOf('--settings-file');
    expect(inv.args[settingsIdx + 1]).toContain('amp-deep-settings.json');
  });

  it('injects read-only safety prompt for deep model', () => {
    const req = { ...baseRequest, extraFlags: ['-m', 'deep'] };
    const inv = adapter.buildInvocation(req);
    expect(inv.stdin).toContain('MANDATORY: Do not change any files');
    expect(inv.stdin).toContain('read-only mode');
  });

  it('uses standard settings file for smart model', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.args).toContain('--settings-file');
    const settingsIdx = inv.args.indexOf('--settings-file');
    expect(inv.args[settingsIdx + 1]).toContain('amp-readonly-settings.json');
  });

  it('does not inject safety prompt for smart model', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.stdin).not.toContain('MANDATORY: Do not change any files');
  });

  it('does not treat "deep" as deep mode when not preceded by -m', () => {
    const req = { ...baseRequest, extraFlags: ['--something', 'deep'] };
    const inv = adapter.buildInvocation(req);
    expect(inv.stdin).not.toContain('MANDATORY: Do not change any files');
    const settingsIdx = inv.args.indexOf('--settings-file');
    expect(inv.args[settingsIdx + 1]).toContain('amp-readonly-settings.json');
  });

  it('skips settings file when readOnlyPolicy is none', () => {
    const req = {
      ...baseRequest,
      readOnlyPolicy: 'none' as const,
      extraFlags: ['-m', 'deep'],
    };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).not.toContain('--settings-file');
  });

  it('skips settings file when file does not exist on disk', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const req = { ...baseRequest, extraFlags: ['-m', 'deep'] };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).not.toContain('--settings-file');
    // Safety prompt should still be injected even without settings file
    expect(inv.stdin).toContain('MANDATORY: Do not change any files');
  });

  it('handles undefined extraFlags without crashing', () => {
    const req = { ...baseRequest, extraFlags: undefined };
    const inv = adapter.buildInvocation(req);
    expect(inv.stdin).not.toContain('MANDATORY: Do not change any files');
    expect(inv.args).toContain('-x');
  });

  describe('getEffectiveReadOnlyLevel', () => {
    it('returns enforced for smart model', () => {
      const toolConfig = {
        binary: 'amp',
        readOnly: { level: 'enforced' as const },
        extraFlags: ['-m', 'smart'],
      };
      expect(adapter.getEffectiveReadOnlyLevel(toolConfig)).toBe('enforced');
    });

    it('returns bestEffort for deep model', () => {
      const toolConfig = {
        binary: 'amp',
        readOnly: { level: 'enforced' as const },
        extraFlags: ['-m', 'deep'],
      };
      expect(adapter.getEffectiveReadOnlyLevel(toolConfig)).toBe('bestEffort');
    });

    it('returns enforced when no extraFlags', () => {
      const toolConfig = {
        binary: 'amp',
        readOnly: { level: 'enforced' as const },
      };
      expect(adapter.getEffectiveReadOnlyLevel(toolConfig)).toBe('enforced');
    });

    it('returns enforced when deep is not preceded by -m', () => {
      const toolConfig = {
        binary: 'amp',
        readOnly: { level: 'enforced' as const },
        extraFlags: ['--something', 'deep'],
      };
      expect(adapter.getEffectiveReadOnlyLevel(toolConfig)).toBe('enforced');
    });
  });
});

describe('isAmpDeepMode', () => {
  it('returns true for ["-m", "deep"]', () => {
    expect(isAmpDeepMode(['-m', 'deep'])).toBe(true);
  });

  it('returns false for ["deep"] without -m prefix', () => {
    expect(isAmpDeepMode(['deep'])).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAmpDeepMode(undefined)).toBe(false);
  });

  it('returns false when deep is preceded by something other than -m', () => {
    expect(isAmpDeepMode(['--something', 'deep'])).toBe(false);
  });

  it('returns true when -m deep appears after other flags', () => {
    expect(isAmpDeepMode(['-x', '-m', 'deep'])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isAmpDeepMode([])).toBe(false);
  });
});

describe('parseAmpUsage', () => {
  it('parses usage output', () => {
    const output = `
Usage for your account:
  Amp Free: $3.50/$10.00 remaining this month
  Individual credits: $25.00 remaining
`;
    const result = parseAmpUsage(output);
    expect(result.freeRemaining).toBe(3.5);
    expect(result.freeTotal).toBe(10);
    expect(result.creditsRemaining).toBe(25);
  });

  it('returns zeros for unparseable output', () => {
    const result = parseAmpUsage('something unexpected');
    expect(result.freeRemaining).toBe(0);
    expect(result.freeTotal).toBe(0);
    expect(result.creditsRemaining).toBe(0);
  });
});

describe('computeAmpCost', () => {
  it('computes cost from before/after snapshots', () => {
    const before = { freeRemaining: 5.0, freeTotal: 10, creditsRemaining: 25 };
    const after = { freeRemaining: 4.5, freeTotal: 10, creditsRemaining: 25 };
    const cost = computeAmpCost(before, after);
    expect(cost.cost_usd).toBe(0.5);
    expect(cost.free_used_usd).toBe(0.5);
    expect(cost.credits_used_usd).toBe(0);
    expect(cost.source).toBe('free');
  });

  it('detects credit usage', () => {
    const before = { freeRemaining: 0, freeTotal: 10, creditsRemaining: 25 };
    const after = { freeRemaining: 0, freeTotal: 10, creditsRemaining: 23.5 };
    const cost = computeAmpCost(before, after);
    expect(cost.cost_usd).toBe(1.5);
    expect(cost.credits_used_usd).toBe(1.5);
    expect(cost.source).toBe('credits');
  });

  it('handles no change', () => {
    const snapshot = { freeRemaining: 5, freeTotal: 10, creditsRemaining: 25 };
    const cost = computeAmpCost(snapshot, snapshot);
    expect(cost.cost_usd).toBe(0);
  });
});
