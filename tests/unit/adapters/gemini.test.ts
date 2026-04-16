import { describe, expect, it } from 'vitest';
import { GeminiAdapter } from '../../../src/adapters/gemini.js';
import type { RunRequest } from '../../../src/types.js';

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter();

  const baseRequest: RunRequest = {
    prompt: 'test prompt',
    promptFilePath: '/tmp/prompt.md',
    toolId: 'gemini',
    outputDir: '/tmp/out',
    readOnlyPolicy: 'bestEffort',
    timeout: 540,
    cwd: '/tmp',
    extraFlags: ['-m', 'gemini-3.1-pro-preview'],
  };

  it('has correct metadata', () => {
    expect(adapter.id).toBe('gemini');
    expect(adapter.readOnly.level).toBe('enforced');
    expect(adapter.modelFlag).toBe('-m');
  });

  it('builds invocation with headless mode and stdin prompt', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('gemini');
    expect(inv.args[0]).toBe('-p');
    expect(inv.args[1]).toBe('');
    expect(inv.args).toContain('-m');
    expect(inv.args).toContain('gemini-3.1-pro-preview');
    expect(inv.stdin).toContain('test prompt');
    expect(inv.stdin).toContain('Do not narrate');
    expect(inv.args).toContain('--output-format');
    // No positional instruction arg
    expect(inv.args.join(' ')).not.toContain('Read the file');
  });

  it('builds invocation with tool restrictions using --extensions', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.args).toContain('--extensions');
    expect(inv.args[inv.args.indexOf('--extensions') + 1]).toBe('');
    expect(inv.args).toContain('--allowed-tools');
    // Each tool is a separate arg, not comma-joined
    expect(inv.args).toContain('read_file');
    expect(inv.args).toContain('list_directory');
    expect(inv.args).toContain('search_file_content');
    expect(inv.args).toContain('glob');
    expect(inv.args).toContain('google_web_search');
    expect(inv.args).toContain('codebase_investigator');
    expect(inv.args).not.toContain('read_file,read_many_files,web_fetch');
    expect(inv.args).not.toContain('--allowed-mcp-server-names');
  });

  it('omits tool restrictions when policy is none', () => {
    const req = { ...baseRequest, readOnlyPolicy: 'none' as const };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).not.toContain('--allowed-tools');
    expect(inv.args).not.toContain('--extensions');
  });

  it('uses req.binary when provided', () => {
    const req = { ...baseRequest, binary: '/usr/local/bin/gemini' };
    const inv = adapter.buildInvocation(req);
    expect(inv.cmd).toBe('/usr/local/bin/gemini');
  });

  it('falls back to "gemini" when req.binary is undefined', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('gemini');
  });
});
